// notify-dispatch: scheduled evaluator for alert / WRS / outlook notifications.
//
// Runs every 5 minutes. For every user who opted in it resolves their saved
// hometown, checks:
//   • new NWS/MeteoAlarm alerts covering that point, and severity upgrades
//   • rapid WRS swings (default 15 points inside 30 minutes)
//   • SPC convective outlook at ENH or above (and any upgrade)
//   • SPC fire weather outlook at Elevated or above (and any change)
// Matching events are written to public.notifications (in-app inbox, realtime)
// and pushed to the user's registered browsers via Web Push.
import { createClient } from "npm:@supabase/supabase-js@2";
import { pointInGeom, type Geom } from "../_shared/geo.ts";
import { fetchSounding, wrsFromSounding } from "../_shared/wrs-server.ts";
import { sendPush, type VapidKeys } from "../_shared/webpush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SPC_URL =
  "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query?where=1%3D1&outFields=LABEL,ISSUE&returnGeometry=true&f=geojson";
const FIRE_URL =
  "https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/1/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson";

const SPC_RANK: Record<string, number> = { TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5 };
const SPC_LABEL: Record<string, string> = {
  ENH: "Enhanced risk", MDT: "Moderate risk", HIGH: "High risk",
};
const FIRE_DN: Record<number, string> = { 5: "ELEV", 8: "CRIT", 10: "EXTM" };
const FIRE_RANK: Record<string, number> = { NONE: 0, ELEV: 1, CRIT: 2, EXTM: 3 };
const FIRE_LABEL: Record<string, string> = {
  ELEV: "Elevated", CRIT: "Critical", EXTM: "Extreme",
};
const SEV_RANK: Record<string, number> = {
  Unknown: 0, Minor: 1, Moderate: 2, Severe: 3, Extreme: 4,
};

// Rate limits (per user).
const MAX_PER_HOUR = 10;
// Chat reports: how far back a first-time user is caught up on, and the
// radius that counts as "local" for scope = local.
const CHAT_LOOKBACK_MS = 15 * 60 * 1000;
const CHAT_LOCAL_RADIUS_KM = 150;
const WRS_COOLDOWN_MS = 60 * 60 * 1000;
const WRS_WINDOW_MS = 30 * 60 * 1000;

interface Pending {
  title: string;
  body: string;
  category: string;
  severity: string | null;
  dedupe: string;
  payload: Record<string, unknown>;
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function geocode(label: string): Promise<{ lat: number; lon: number } | null> {
  const first = label.split(",")[0]?.trim();
  if (!first) return null;
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(first)}` +
    `&count=5&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const results: Array<Record<string, unknown>> = json?.results ?? [];
  if (!results.length) return null;
  const admin = label.split(",")[1]?.trim().toLowerCase();
  const match =
    (admin && results.find((r) => String(r.admin1 ?? "").toLowerCase() === admin)) || results[0];
  return { lat: Number(match.latitude), lon: Number(match.longitude) };
}

/** Great-circle distance in km. */
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** True when the user's local hour falls inside their quiet-hours window. */
function inQuietHours(tz: string | null, start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric", hour12: false, timeZone: tz || "UTC",
      }).format(new Date()),
    );
  } catch {
    hour = new Date().getUTCHours();
  }
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

// ─── entrypoint ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const authorized = auth === `Bearer ${SERVICE_KEY}` ||
    (CRON_SECRET && (cronHeader === CRON_SECRET || auth === `Bearer ${CRON_SECRET}`));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

  let vapid: VapidKeys | null = null;
  try {
    const jwk = Deno.env.get("VAPID_PRIVATE_JWK");
    const pub = Deno.env.get("VAPID_PUBLIC_KEY");
    const sub = Deno.env.get("VAPID_SUBJECT");
    if (jwk && pub && sub) vapid = { privateJwk: JSON.parse(jwk), publicKey: pub, subject: sub };
  } catch { vapid = null; }

  try {
    // 1. Users who opted in, with their saved hometown.
    const { data: prefs } = await supabase
      .from("notification_prefs")
      .select("*")
      .eq("enabled", true);
    if (!prefs?.length) {
      return new Response(JSON.stringify({ ok: true, users: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = prefs.map((p) => p.user_id);
    const chatSince = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [{ data: profiles }, { data: states }, { data: alerts }, { data: chatRows }] =
      await Promise.all([
        supabase.from("profiles").select("id, username, location").in("id", userIds),
        supabase.from("notification_state").select("*").in("user_id", userIds),
        supabase
          .from("active_alerts")
          .select("alert_id, event, severity, headline, area_desc, expires_at, geometry"),
        supabase
          .from("messages")
          .select("id, user_id, username, content, created_at, place_lat, place_lon")
          .neq("badge", "System")
          .gte("created_at", chatSince)
          .order("created_at", { ascending: true }),
      ]);
    const chatMessages = chatRows ?? [];

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const stateById = new Map((states ?? []).map((s) => [s.user_id, s]));

    // 2. Outlook layers, fetched once per run and shared by all users.
    const [spcRes, fireRes] = await Promise.allSettled([fetch(SPC_URL), fetch(FIRE_URL)]);
    const spcFeats: Array<{ properties: Record<string, unknown>; geometry: Geom }> =
      spcRes.status === "fulfilled" && spcRes.value.ok ? (await spcRes.value.json())?.features ?? [] : [];
    const fireFeats: Array<{ properties: Record<string, unknown>; geometry: Geom }> =
      fireRes.status === "fulfilled" && fireRes.value.ok ? (await fireRes.value.json())?.features ?? [] : [];

    const now = Date.now();
    const liveAlerts = (alerts ?? []).filter(
      (a) => !a.expires_at || new Date(a.expires_at).getTime() > now,
    );

    const geoCache = new Map<string, { lat: number; lon: number } | null>();
    const wrsCache = new Map<string, number | null>();
    let delivered = 0;

    for (const pref of prefs) {
      const profile = profileById.get(pref.user_id);
      const location = profile?.location ?? null;
      if (!location) continue;

      if (!geoCache.has(location)) geoCache.set(location, await geocode(location));
      const pt = geoCache.get(location);
      if (!pt) continue;

      const state = stateById.get(pref.user_id) ?? null;
      const pending: Pending[] = [];
      const cityLabel = location.split(",")[0]?.trim() || location;

      // ── 2a. Alerts covering the hometown point ──────────────────────────
      const covering = liveAlerts.filter((a) =>
        pointInGeom(pt.lon, pt.lat, a.geometry as unknown as Geom),
      );
      const prevAlerts = (state?.active_alerts ?? {}) as Record<string, string>;
      const nextAlerts: Record<string, string> = {};
      for (const a of covering) {
        const sev = a.severity ?? "Unknown";
        nextAlerts[a.alert_id] = sev;
        const prevSev = prevAlerts[a.alert_id];
        if (prevSev === undefined) {
          if (pref.alerts_new) {
            pending.push({
              title: `${a.event ?? "Weather alert"} - ${cityLabel}`,
              body: a.headline || a.area_desc || `${a.event} in effect for your area.`,
              category: "alert_new",
              severity: sev,
              dedupe: `alert:new:${a.alert_id}`,
              payload: { alertId: a.alert_id, event: a.event, severity: sev },
            });
          }
        } else if (pref.alerts_upgrade && (SEV_RANK[sev] ?? 0) > (SEV_RANK[prevSev] ?? 0)) {
          pending.push({
            title: `${a.event ?? "Alert"} upgraded to ${sev}`,
            body: a.headline || `${a.event} severity increased in ${cityLabel}.`,
            category: "alert_upgrade",
            severity: sev,
            dedupe: `alert:upg:${a.alert_id}:${sev}`,
            payload: { alertId: a.alert_id, event: a.event, severity: sev },
          });
        }
      }

      // ── 2b. WRS swings ──────────────────────────────────────────────────
      const key = `${pt.lat.toFixed(2)},${pt.lon.toFixed(2)}`;
      if (!wrsCache.has(key)) {
        const s = await fetchSounding(pt.lat, pt.lon);
        wrsCache.set(key, s ? wrsFromSounding(s) : null);
      }
      const wrs = wrsCache.get(key) ?? null;
      if (wrs != null && pref.wrs_swings) {
        const prev = state?.last_wrs != null ? Number(state.last_wrs) : null;
        const prevAt = state?.last_wrs_at ? new Date(state.last_wrs_at).getTime() : 0;
        const lastNotified = state?.last_wrs_notified_at
          ? new Date(state.last_wrs_notified_at).getTime()
          : 0;
        const delta = prev != null ? wrs - prev : 0;
        const fresh = now - prevAt <= WRS_WINDOW_MS;
        if (
          prev != null && fresh &&
          Math.abs(delta) >= (pref.wrs_delta ?? 15) &&
          now - lastNotified >= WRS_COOLDOWN_MS
        ) {
          const dir = delta > 0 ? "rising" : "easing";
          pending.push({
            title: `Storm risk ${dir} in ${cityLabel}`,
            body: `Weather Risk Score moved ${delta > 0 ? "+" : ""}${Math.round(delta)} points to ${wrs}/100.`,
            category: "wrs_swing",
            severity: wrs >= 60 ? "Severe" : "Moderate",
            dedupe: `wrs:${new Date().toISOString().slice(0, 13)}:${wrs}`,
            payload: { wrs, delta: Math.round(delta) },
          });
        }
      }

      // ── 2c. SPC convective outlook ──────────────────────────────────────
      let spcLevel = "NONE";
      for (const f of spcFeats) {
        const label = String(f.properties?.label ?? f.properties?.LABEL ?? "").toUpperCase();
        if (!(label in SPC_RANK)) continue;
        if (!pointInGeom(pt.lon, pt.lat, f.geometry)) continue;
        if ((SPC_RANK[label] ?? -1) > (SPC_RANK[spcLevel] ?? -1)) spcLevel = label;
      }
      if (pref.spc_outlook && (SPC_RANK[spcLevel] ?? -1) >= 3) {
        const prev = state?.last_spc ?? "NONE";
        if ((SPC_RANK[spcLevel] ?? -1) > (SPC_RANK[prev] ?? -1)) {
          pending.push({
            title: `SPC ${SPC_LABEL[spcLevel] ?? spcLevel} - ${cityLabel}`,
            body: `Your area is now in an SPC ${(SPC_LABEL[spcLevel] ?? spcLevel).toLowerCase()} for severe thunderstorms.`,
            category: "spc_outlook",
            severity: spcLevel === "HIGH" ? "Extreme" : "Severe",
            dedupe: `spc:${new Date().toISOString().slice(0, 10)}:${spcLevel}`,
            payload: { level: spcLevel },
          });
        }
      }

      // ── 2d. Fire weather outlook ────────────────────────────────────────
      let fireLevel = "NONE";
      for (const f of fireFeats) {
        const lvl = FIRE_DN[Number(f.properties?.dn)];
        if (!lvl) continue;
        if (!pointInGeom(pt.lon, pt.lat, f.geometry)) continue;
        if (FIRE_RANK[lvl] > FIRE_RANK[fireLevel]) fireLevel = lvl;
      }
      if (pref.fire_outlook && fireLevel !== "NONE" && fireLevel !== (state?.last_fire ?? "NONE")) {
        pending.push({
          title: `${FIRE_LABEL[fireLevel]} fire weather - ${cityLabel}`,
          body: `SPC lists your area at ${FIRE_LABEL[fireLevel].toLowerCase()} fire weather risk today.`,
          category: "fire_outlook",
          severity: fireLevel === "EXTM" ? "Extreme" : "Severe",
          dedupe: `fire:${new Date().toISOString().slice(0, 10)}:${fireLevel}`,
          payload: { level: fireLevel },
        });
      }

      // ── 2e. Chat reports (all / local) ─────────────────────────
      const chatCutoff = state?.last_chat_at
        ? new Date(state.last_chat_at).getTime()
        : now - CHAT_LOOKBACK_MS;
      let freshChat: typeof chatMessages = [];
      if (pref.chat_messages) {
        freshChat = chatMessages.filter((m) => {
          if (m.user_id === pref.user_id) return false;
          if (new Date(m.created_at as string).getTime() <= chatCutoff) return false;
          if (pref.chat_scope !== "local") return true;
          if (m.place_lat == null || m.place_lon == null) return false;
          return haversineKm(pt.lat, pt.lon, Number(m.place_lat), Number(m.place_lon)) <=
            CHAT_LOCAL_RADIUS_KM;
        });
        if (freshChat.length) {
          const latest = freshChat[freshChat.length - 1];
          const extra = freshChat.length - 1;
          pending.push({
            title: freshChat.length === 1
              ? `New chat report from ${latest.username}`
              : `${freshChat.length} new chat reports`,
            body: extra > 0
              ? `${latest.username}: ${latest.content} (+${extra} more)`
              : `${latest.username}: ${latest.content}`,
            category: "chat_message",
            severity: null,
            dedupe: `chat:${pref.user_id}:${latest.id}`,
            payload: { messageId: latest.id, count: freshChat.length, scope: pref.chat_scope },
          });
        }
      }

      // ── 3. Persist the new snapshot regardless of delivery ──────────────
      const wrsChanged = wrs != null;
      const notifiedWrs = pending.some((p) => p.category === "wrs_swing");
      await supabase.from("notification_state").upsert({
        user_id: pref.user_id,
        last_wrs: wrsChanged ? wrs : state?.last_wrs ?? null,
        last_wrs_at: wrsChanged ? new Date().toISOString() : state?.last_wrs_at ?? null,
        last_wrs_notified_at: notifiedWrs
          ? new Date().toISOString()
          : state?.last_wrs_notified_at ?? null,
        last_spc: spcLevel,
        last_fire: fireLevel,
        active_alerts: nextAlerts,
        last_chat_at: freshChat.length
          ? freshChat[freshChat.length - 1].created_at
          : state?.last_chat_at ?? new Date(now - CHAT_LOOKBACK_MS).toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (!pending.length) continue;

      // Quiet hours suppress delivery (state is still tracked above).
      if (inQuietHours(pref.timezone, pref.quiet_start, pref.quiet_end)) continue;

      // Hourly cap.
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", pref.user_id)
        .gte("created_at", new Date(now - 60 * 60 * 1000).toISOString());
      let budget = Math.max(0, MAX_PER_HOUR - (count ?? 0));
      if (!budget) continue;

      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth_key")
        .eq("user_id", pref.user_id);

      for (const item of pending) {
        if (!budget) break;
        const { data: inserted, error } = await supabase
          .from("notifications")
          .insert({
            user_id: pref.user_id,
            title: item.title,
            body: item.body,
            category: item.category,
            severity: item.severity,
            payload: item.payload,
            dedupe_key: item.dedupe,
          })
          .select("id")
          .maybeSingle();
        // Unique violation = already delivered for this dedupe key.
        if (error || !inserted) continue;
        budget--;
        delivered++;

        if (!vapid || !subs?.length) continue;
        const body = JSON.stringify({
          title: item.title,
          body: item.body,
          category: item.category,
          severity: item.severity,
          id: inserted.id,
        });
        for (const s of subs) {
          try {
            const r = await sendPush(
              { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth_key },
              body,
              vapid,
            );
            if (r.expired) await supabase.from("push_subscriptions").delete().eq("id", s.id);
          } catch (e) {
            console.error("[notify-dispatch] push failed", String(e));
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, users: prefs.length, delivered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-dispatch] failed", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
