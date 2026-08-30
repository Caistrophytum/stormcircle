// meteoalarm-poll: scheduled ingest of European weather warnings from the
// EUMETNET MeteoAlarm public country feeds.
//
// Source: https://feeds.meteoalarm.org/api/v1/warnings/feeds-<country>
//   Free, no token, one JSON document per member country. Each document is a
//   list of CAP alerts; every alert carries one info block per language and a
//   list of areas.
//
// Geometry (see geometry.ts):
//   1. CAP `polygon` / `circle` when the member service publishes coordinates
//      (Norway, UK, Israel, ...).
//   2. `NUTS3` geocodes -> Eurostat GISCO NUTS3 boundaries.
//   3. `EMMA_ID` geocodes -> MeteoAlarm awareness-region boundaries.
//   Resolved shapes are cached in `zone_geom_cache` so a run costs one small
//   query instead of a multi-megabyte download.
//
// Rows land in `active_alerts` with an "MA-<CC>-" alert_id prefix so the whole
// downstream stack (map polygons, current-location hazards, danger lists,
// notifications) works unchanged. One row per alert info block: all areas of
// that block are merged into a single MultiPolygon.
import { createClient } from "npm:@supabase/supabase-js@2";
import { GeometryResolver, type Geometry } from "./geometry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FEED_BASE = "https://feeds.meteoalarm.org/api/v1/warnings/feeds-";
const FETCH_TIMEOUT_MS = 30_000;
const FEED_CONCURRENCY = 6;
const DEFAULT_DURATION_MS = 12 * 60 * 60 * 1000;

/** MeteoAlarm member countries. Israel is served by our own ims-poll. */
const COUNTRIES: [slug: string, iso2: string][] = [
  ["andorra", "AD"], ["austria", "AT"], ["belgium", "BE"], ["bosnia-herzegovina", "BA"],
  ["bulgaria", "BG"], ["croatia", "HR"], ["cyprus", "CY"], ["czechia", "CZ"],
  ["denmark", "DK"], ["estonia", "EE"], ["finland", "FI"], ["france", "FR"],
  ["germany", "DE"], ["greece", "GR"], ["hungary", "HU"], ["iceland", "IS"],
  ["ireland", "IE"], ["italy", "IT"], ["latvia", "LV"], ["lithuania", "LT"],
  ["luxembourg", "LU"], ["malta", "MT"], ["moldova", "MD"], ["montenegro", "ME"],
  ["netherlands", "NL"], ["norway", "NO"], ["poland", "PL"], ["portugal", "PT"],
  ["republic-of-north-macedonia", "MK"], ["romania", "RO"], ["serbia", "RS"],
  ["slovakia", "SK"], ["slovenia", "SI"], ["spain", "ES"], ["sweden", "SE"],
  ["switzerland", "CH"], ["ukraine", "UA"], ["united-kingdom", "GB"],
];

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

/** "3; orange; Severe" / "orange" / 3 -> canonical leading token */
function code(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).split(";")[0].trim().toLowerCase();
}

function hash(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
}

export interface Row {
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
  geometry: Geometry | null;
  properties: Record<string, unknown>;
}

type Info = Record<string, unknown>;
type Area = {
  areaDesc?: string;
  polygon?: string[];
  circle?: string[];
  geocode?: { value?: string; valueName?: string }[];
};

function paramValue(info: Info, name: string): string {
  const params = (info.parameter as { valueName?: string; value?: string }[] | undefined) ?? [];
  const hit = params.find((p) => String(p.valueName ?? "").toLowerCase() === name);
  return hit?.value ?? "";
}

/** English info blocks (fall back to whatever the member published). */
function englishInfos(alert: Record<string, unknown>): Info[] {
  const infos = (alert.info as Info[] | undefined) ?? [];
  const english = infos.filter((i) => String(i.language ?? "en").toLowerCase().startsWith("en"));
  return english.length ? english : infos;
}

/** Build one active_alerts row from a CAP info block. Geometry filled later. */
export function buildRow(
  alert: Record<string, unknown>,
  info: Info,
  iso2: string,
  now: number,
): Row | null {
  if (String(alert.status ?? "Actual") !== "Actual") return null;
  const msgType = String(alert.msgType ?? "Alert");
  if (msgType === "Cancel" || msgType === "Ack" || msgType === "Error") return null;

  const levelCode = code(paramValue(info, "awareness_level"));
  // Awareness level 1 is "green" - informational, not an actionable warning.
  if (levelCode === "1") return null;
  const typeCode = code(paramValue(info, "awareness_type"));

  const severity =
    SEVERITY_BY_LEVEL[levelCode] ??
    ((): Severity => {
      const s = String(info.severity ?? "").toLowerCase();
      if (s.startsWith("extreme")) return "Extreme";
      if (s.startsWith("severe")) return "Severe";
      if (s.startsWith("minor")) return "Minor";
      return "Moderate";
    })();

  const parse = (v: unknown): number => Date.parse(String(v ?? ""));

  const expiresMs = parse(info.expires);
  const expires = Number.isNaN(expiresMs)
    ? new Date(now + DEFAULT_DURATION_MS).toISOString()
    : new Date(expiresMs).toISOString();
  if (Date.parse(expires) <= now) return null;

  const rawEvent = String(info.event ?? "").trim();
  const event = AWARENESS_EVENT[typeCode] ??
    (rawEvent ? titleCase(rawEvent).slice(0, 90) : "Weather Warning");

  const areas = (info.area as Area[] | undefined) ?? [];
  const names = areas.map((a) => String(a.areaDesc ?? "").trim()).filter(Boolean);
  const areaDesc = (names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3} more` : names.join(", ")) ||
    `${iso2} warning area`;

  const sentMs = parse(alert.sent);
  const sent = Number.isNaN(sentMs) ? new Date(now).toISOString() : new Date(sentMs).toISOString();

  const onsetMs = parse(info.onset ?? info.effective);
  const onset = Number.isNaN(onsetMs) ? null : new Date(onsetMs).toISOString();

  const headline = String(info.headline ?? "").trim() || `${severity} ${event} for ${areaDesc}`;
  const identifier = String(alert.identifier ?? "");

  return {
    alert_id: `MA-${iso2}-${hash(`${identifier}|${levelCode}|${typeCode}|${info.language ?? ""}`)}`,
    event,
    severity,
    certainty: String(info.certainty ?? "Likely"),
    urgency: String(info.urgency ?? (onset && Date.parse(onset) > now ? "Future" : "Expected")),
    headline: headline.slice(0, 300),
    area_desc: areaDesc.slice(0, 300),
    sent,
    effective: onset ?? sent,
    onset,
    expires_at: expires,
    ends: expires,
    status: "Actual",
    message_type: msgType,
    geometry: null,
    properties: {
      description: String(info.description ?? "").trim() || headline,
      instruction: String(info.instruction ?? "").trim(),
      headline,
      source: "MeteoAlarm",
      parameters: {
        senderName: String(info.senderName ?? "MeteoAlarm"),
        country: iso2,
        awarenessLevel: levelCode,
        awarenessType: typeCode,
        capAlertId: identifier,
        areas: names.slice(0, 40),
      },
      affectedZones: [],
    },
  };
}

async function fetchFeed(slug: string): Promise<Record<string, unknown>[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${FEED_BASE}${slug}`, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "StormCircle/1.0 (bot@stormcircle.net)",
      },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const body = (await res.json()) as { warnings?: { alert?: Record<string, unknown> }[] };
    return (body.warnings ?? []).map((w) => w.alert ?? {}).filter((a) => Object.keys(a).length > 0);
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

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

  try {
    const now = Date.now();

    // 1. Pull every country feed with bounded concurrency.
    const rows: Row[] = [];
    const pending: { row: Row; areas: Area[] }[] = [];
    const failed: string[] = [];
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(FEED_CONCURRENCY, COUNTRIES.length) }, async () => {
        while (cursor < COUNTRIES.length) {
          const [slug, iso2] = COUNTRIES[cursor++];
          let alerts: Record<string, unknown>[];
          try {
            alerts = await fetchFeed(slug);
          } catch (e) {
            failed.push(`${slug}:${String(e)}`);
            continue;
          }
          for (const alert of alerts) {
            for (const info of englishInfos(alert)) {
              const row = buildRow(alert, info, iso2, now);
              if (!row) continue;
              pending.push({ row, areas: (info.area as Area[] | undefined) ?? [] });
            }
          }
        }
      }),
    );

    // 2. Resolve geometry (inline CAP shapes, then cached region boundaries).
    const resolver = new GeometryResolver(supabase);
    await resolver.prepare(pending.map((p) => p.areas));
    const byId = new Map<string, Row>();
    for (const { row, areas } of pending) {
      row.geometry = resolver.resolve(areas);
      byId.set(row.alert_id, row);
    }
    rows.push(...byId.values());

    // 3. Upsert, preserving first_seen_at, then drop everything that vanished.
    const nowIso = new Date(now).toISOString();
    const { data: existing } = await supabase
      .from("active_alerts")
      .select("alert_id, first_seen_at")
      .like("alert_id", "MA-%");
    const firstSeen = new Map<string, string>();
    for (const r of existing ?? []) if (r.first_seen_at) firstSeen.set(r.alert_id, r.first_seen_at);

    const payload = rows.map((r) => ({
      ...r,
      updated_at: nowIso,
      first_seen_at: firstSeen.get(r.alert_id) ?? nowIso,
    }));

    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await supabase
        .from("active_alerts")
        .upsert(payload.slice(i, i + 200), { onConflict: "alert_id" });
      if (error) console.warn("[meteoalarm-poll] upsert err:", error);
    }

    const currentIds = new Set(rows.map((r) => r.alert_id));
    const toDelete = (existing ?? [])
      .map((r: { alert_id: string }) => r.alert_id)
      .filter((id: string) => !currentIds.has(id));
    for (let i = 0; i < toDelete.length; i += 300) {
      await supabase.from("active_alerts").delete().in("alert_id", toDelete.slice(i, i + 300));
    }

    const withGeom = rows.filter((r) => r.geometry).length;
    console.log(
      `[meteoalarm-poll] ${rows.length} active (${withGeom} with geometry), ` +
        `${toDelete.length} removed, ${failed.length} feeds failed`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        active: rows.length,
        withGeometry: withGeom,
        deleted: toDelete.length,
        failedFeeds: failed,
        unresolvedCodes: resolver.unresolved(),
      }),
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
