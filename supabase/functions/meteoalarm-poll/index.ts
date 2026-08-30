// meteoalarm-poll: scheduled ingest of European weather warnings from the
// EUMETNET MeteoAlarm EDR API (https://api.meteoalarm.org/edr/v1).
//
// The API serves CAP-derived warnings as GeoJSON through the "locations"
// data query. Every feature carries a polygon/multipolygon footprint plus CAP
// properties (event, awareness type/level, onset, expires, sender...).
//
// Rows are written into `active_alerts` with an "MA-<CC>-" alert_id prefix so
// the whole downstream stack (map polygons, current-location hazards, danger
// lists, notifications) works unchanged.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BASE = "https://api.meteoalarm.org/edr/v1/collections/warnings/locations";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_PAGES = 25;
const DEFAULT_DURATION_MS = 12 * 60 * 60 * 1000;

type Severity = "Extreme" | "Severe" | "Moderate" | "Minor";

const SEVERITY_BY_LEVEL: Record<string, Severity> = {
  "1": "Minor",
  "2": "Moderate",
  "3": "Severe",
  "4": "Extreme",
};

const AWARENESS_EVENT: Record<string, string> = {
  "1": "Wind Warning",
  "2": "Snow/Ice Warning",
  "3": "Thunderstorm Warning",
  "4": "Fog Warning",
  "5": "Extreme High Temperature Warning",
  "6": "Extreme Low Temperature Warning",
  "7": "Coastal Event Warning",
  "8": "Forest Fire Warning",
  "9": "Avalanche Warning",
  "10": "Rain Warning",
  "12": "Flood Warning",
  "13": "Rain-Flood Warning",
  "14": "Marine Hazard Warning",
  "15": "Drought Warning",
};

/** "3; orange; Severe" / "orange" / 3 -> canonical token */
function code(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).split(";")[0].trim().toLowerCase();
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
}

function hash(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

interface Row {
  alert_id: string;
  event: string;
  severity: Severity;
  certainty: string;
  urgency: string;
  headline: string;
  area_desc: string;
  sent: string;
  effective: string;
  onset: string | null;
  expires_at: string;
  ends: string;
  status: string;
  message_type: string;
  geometry: unknown;
  properties: Record<string, unknown>;
}

/** Convert one MeteoAlarm GeoJSON feature into an active_alerts row. */
export function featureToRow(feature: Record<string, unknown>, now: number): Row | null {
  const geometry = feature.geometry as Record<string, unknown> | null;
  if (!geometry || !geometry.type) return null;
  const p = ((feature.properties ?? {}) as Record<string, unknown>) ?? {};

  // MeteoAlarm nests the CAP info block under a few different shapes depending
  // on the member state; flatten the first one that exists.
  const infoRaw = pick(p, ["info", "cap_info"]);
  const info: Record<string, unknown> = Array.isArray(infoRaw)
    ? ((infoRaw[0] ?? {}) as Record<string, unknown>)
    : ((infoRaw ?? {}) as Record<string, unknown>);
  const all: Record<string, unknown> = { ...info, ...p };

  const levelCode = code(pick(all, ["awareness_level", "awarenessLevel", "level"]));
  const typeCode = code(pick(all, ["awareness_type", "awarenessType", "type"]));

  const severity =
    SEVERITY_BY_LEVEL[levelCode] ??
    ((): Severity => {
      const s = String(pick(all, ["severity"]) ?? "").toLowerCase();
      if (s.startsWith("extreme")) return "Extreme";
      if (s.startsWith("severe")) return "Severe";
      if (s.startsWith("minor")) return "Minor";
      return "Moderate";
    })();

  // Skip green / informational products - they are not actionable warnings.
  if (levelCode === "1" && severity === "Minor") return null;

  const rawEvent = String(pick(all, ["event", "headline"]) ?? "").trim();
  const event =
    AWARENESS_EVENT[typeCode] ??
    (rawEvent ? titleCase(rawEvent).slice(0, 90) : "Weather Warning");

  const sentRaw = String(pick(all, ["sent", "sent_time", "effective"]) ?? "");
  const sent = Number.isNaN(Date.parse(sentRaw)) ? new Date(now).toISOString() : new Date(sentRaw).toISOString();

  const onsetRaw = String(pick(all, ["onset", "effective", "from", "start"]) ?? "");
  const onset = Number.isNaN(Date.parse(onsetRaw)) ? null : new Date(onsetRaw).toISOString();

  const expiresRaw = String(pick(all, ["expires", "until", "end"]) ?? "");
  const expires = Number.isNaN(Date.parse(expiresRaw))
    ? new Date(now + DEFAULT_DURATION_MS).toISOString()
    : new Date(expiresRaw).toISOString();

  const country = String(pick(all, ["country", "country_code", "iso3166-1", "emma_id"]) ?? "")
    .slice(0, 2)
    .toUpperCase() || "EU";

  const areaDesc =
    String(pick(all, ["area_desc", "areaDesc", "area", "region", "name"]) ?? "").trim() ||
    `${country} warning area`;

  const senderName = String(pick(all, ["sender_name", "senderName", "sender"]) ?? "MeteoAlarm");
  const description = String(pick(all, ["description", "text"]) ?? "").trim();
  const instruction = String(pick(all, ["instruction"]) ?? "").trim();
  const headlineRaw = String(pick(all, ["headline"]) ?? "").trim();
  const headline = headlineRaw || `${severity} ${event} for ${areaDesc}`;

  const identifier = String(pick(all, ["identifier", "id"]) ?? "");
  const alertId = `MA-${country}-${hash(`${identifier}|${event}|${areaDesc}|${onset ?? ""}|${expires}`)}`;

  return {
    alert_id: alertId,
    event,
    severity,
    certainty: String(pick(all, ["certainty"]) ?? "Likely"),
    urgency: onset && Date.parse(onset) > now ? "Future" : String(pick(all, ["urgency"]) ?? "Expected"),
    headline,
    area_desc: areaDesc,
    sent,
    effective: onset ?? sent,
    onset,
    expires_at: expires,
    ends: expires,
    status: "Actual",
    message_type: "Alert",
    geometry,
    properties: {
      description: description || headline,
      instruction,
      headline,
      source: "MeteoAlarm",
      parameters: {
        senderName,
        country,
        awarenessLevel: levelCode,
        awarenessType: typeCode,
      },
      affectedZones: [],
    },
  };
}

async function fetchPage(token: string, page: number, activeFrom: string): Promise<Record<string, unknown>> {
  const url = new URL(BASE);
  url.searchParams.set("language", "en");
  url.searchParams.set("active", activeFrom);
  if (page > 1) url.searchParams.set("page", String(page));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/geo+json, application/json",
        "User-Agent": "StormCircle/1.0 (bot@stormcircle.net)",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`MeteoAlarm ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const authorized =
    auth === `Bearer ${SERVICE_KEY}` ||
    (CRON_SECRET && (cronHeader === CRON_SECRET || auth === `Bearer ${CRON_SECRET}`));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Trim: pasted credentials often carry a trailing newline or quotes.
  const token = (Deno.env.get("METEOALARM_API_TOKEN") ?? "").trim().replace(/^["']|["']$/g, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "METEOALARM_API_TOKEN not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sample = new URL(req.url).searchParams.get("sample") === "1";

  // Auth diagnostics: reports which authentication variant the API accepts.
  // Never echoes the token itself, only its length.
  if (new URL(req.url).searchParams.get("probe") === "1") {
    const u = `${BASE}?language=en`;
    const out: Record<string, unknown> = { tokenLength: token.length };
    const tries: [string, RequestInit][] = [
      ["bearer", { headers: { Authorization: `Bearer ${token}` } }],
      ["raw", { headers: { Authorization: token } }],
      ["xapikey", { headers: { "X-API-Key": token } }],
      ["apikey", { headers: { apikey: token } }],
      ["tokenScheme", { headers: { Authorization: `Token ${token}` } }],
      ["basicApi", { headers: { Authorization: `Basic ${btoa(`api:${token}`)}` } }],
      ["basicToken", { headers: { Authorization: `Basic ${btoa(`${token}:`)}` } }],
      ["xauthtoken", { headers: { "X-Auth-Token": token } }],
    ];
    for (const [name, init] of tries) {
      try {
        const r = await fetch(u, init);
        out[name] = { status: r.status, body: (await r.text()).slice(0, 150) };
      } catch (e) { out[name] = String(e); }
    }
    for (const q of ["token", "api_key", "access_token"]) {
      try {
        const r = await fetch(`${u}&${q}=${encodeURIComponent(token)}`);
        out[q] = { status: r.status, body: (await r.text()).slice(0, 150) };
      } catch (e) { out[q] = String(e); }
    }
    return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

  try {
    const now = Date.now();
    const activeFrom = new Date(now).toISOString().replace(/\.\d+Z$/, "Z");

    const features: Record<string, unknown>[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await fetchPage(token, page, activeFrom);
      if (sample && page === 1) {
        return new Response(
          JSON.stringify({
            keys: Object.keys(body),
            count: (body.features as unknown[] | undefined)?.length ?? 0,
            first: (body.features as unknown[] | undefined)?.[0] ?? null,
          }).slice(0, 12000),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const page_features = (body.features as Record<string, unknown>[] | undefined) ?? [];
      features.push(...page_features);
      if (page_features.length === 0) break;
      const links = (body.links as { rel?: string }[] | undefined) ?? [];
      if (!links.some((l) => l.rel === "next")) break;
    }

    const nowIso = new Date(now).toISOString();
    const byId = new Map<string, Row>();
    for (const f of features) {
      const row = featureToRow(f, now);
      if (!row) continue;
      if (Date.parse(row.expires_at) <= now) continue;
      byId.set(row.alert_id, row);
    }

    const { data: existing } = await supabase
      .from("active_alerts")
      .select("alert_id, first_seen_at")
      .like("alert_id", "MA-%");
    const firstSeen = new Map<string, string>();
    for (const r of existing ?? []) if (r.first_seen_at) firstSeen.set(r.alert_id, r.first_seen_at);

    const rows = [...byId.values()].map((r) => ({
      ...r,
      updated_at: nowIso,
      first_seen_at: firstSeen.get(r.alert_id) ?? nowIso,
    }));

    // Chunked upsert: a European sweep can exceed a thousand warnings.
    for (let i = 0; i < rows.length; i += 300) {
      const { error } = await supabase
        .from("active_alerts")
        .upsert(rows.slice(i, i + 300), { onConflict: "alert_id" });
      if (error) console.warn("[meteoalarm-poll] upsert err:", error);
    }

    const currentIds = new Set(rows.map((r) => r.alert_id));
    const toDelete = (existing ?? [])
      .map((r: { alert_id: string }) => r.alert_id)
      .filter((id: string) => !currentIds.has(id));
    for (let i = 0; i < toDelete.length; i += 300) {
      await supabase.from("active_alerts").delete().in("alert_id", toDelete.slice(i, i + 300));
    }

    return new Response(
      JSON.stringify({ ok: true, features: features.length, active: rows.length, deleted: toDelete.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[meteoalarm-poll]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
