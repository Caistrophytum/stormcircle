// meteoalarm-poll: scheduled ingest of European weather warnings from the
// EUMETNET MeteoAlarm / MeteoGate EDR API.
//
// Flow (the EDR service only supports the "locations" query):
//   1. GET /warnings/collections/warnings/locations/ALL?datetime=<sent range>
//      -> GeoJSON index. Each feature = one CAP area, geometry is the bbox,
//         properties carry alertId + countryCode + links to the full CAP doc.
//         The datetime filter applies to the CAP "sent" time and must span
//         less than 24 hours, so we sweep the last 23 hours on every run.
//   2. For every distinct alertId, download the linked CAP JSON (hosted on
//      object storage, not rate limited) to get event, severity, onset,
//      expiry, area names and instructions.
//
// Rows are written into `active_alerts` with an "MA-<CC>-" alert_id prefix so
// the whole downstream stack (map polygons, current-location hazards, danger
// lists, notifications) works unchanged.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BASE = "https://api.meteogate.eu/warnings/collections/warnings/locations/ALL";
const FETCH_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 12;          // EDR calls are rate limited (50 / hour / key)
const SWEEP_WINDOWS = 3;       // 3 x 23h back-sweep: catches products issued
                               // days ago that are still (or not yet) valid
const ACTIVE_AHEAD_DAYS = 5;   // keep warnings valid now or starting soon
const MAX_CAP_DOCS = 500;      // safety cap on object-storage fetches per run
const CAP_CONCURRENCY = 8;
const SWEEP_HOURS = 23;        // API rejects ranges of 24 hours or more
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

type CapInfo = Record<string, unknown>;

/** Pick the English CAP info block for the requested area index. */
function selectInfo(cap: Record<string, unknown>, indexInfo: number): CapInfo | null {
  const infos = (cap.info as CapInfo[] | undefined) ?? [];
  if (!infos.length) return null;
  const english = infos.filter((i) => String(i.language ?? "en").toLowerCase().startsWith("en"));
  const pool = english.length ? english : infos;
  return pool[indexInfo] ?? pool[0] ?? null;
}

function paramValue(info: CapInfo, name: string): string {
  const params = (info.parameter as { valueName?: string; value?: string }[] | undefined) ?? [];
  const hit = params.find((p) => String(p.valueName ?? "").toLowerCase() === name);
  return hit?.value ?? "";
}

/**
 * Combine one index feature (geometry + ids) with its CAP document into an
 * active_alerts row. Returns null for green / expired / unusable products.
 */
export function buildRow(
  feature: Record<string, unknown>,
  cap: Record<string, unknown>,
  now: number,
): Row | null {
  const geometry = feature.geometry as Record<string, unknown> | null;
  if (!geometry || !geometry.type) return null;
  const p = ((feature.properties ?? {}) as Record<string, unknown>) ?? {};
  if (p.supersededByAlertId) return null;

  const info = selectInfo(cap, Number(p.indexInfo ?? 0) || 0);
  if (!info) return null;

  const levelCode = code(paramValue(info, "awareness_level"));
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

  // Awareness level 1 is "green" - informational, not an actionable warning.
  if (levelCode === "1") return null;

  const rawEvent = String(info.event ?? "").trim();
  const event = AWARENESS_EVENT[typeCode] ?? (rawEvent ? titleCase(rawEvent).slice(0, 90) : "Weather Warning");

  const country = String(p.countryCode ?? "").slice(0, 2).toUpperCase() || "EU";

  const areas = (info.area as { areaDesc?: string }[] | undefined) ?? [];
  const areaIdx = Number(p.indexArea ?? 0) || 0;
  const areaDesc = String(areas[areaIdx]?.areaDesc ?? areas[0]?.areaDesc ?? "").trim() ||
    `${country} warning area`;

  const parse = (v: unknown): number => Date.parse(String(v ?? ""));

  const sentMs = parse(cap.sent);
  const sent = Number.isNaN(sentMs) ? new Date(now).toISOString() : new Date(sentMs).toISOString();

  const onsetMs = parse(info.onset ?? info.effective);
  const onset = Number.isNaN(onsetMs) ? null : new Date(onsetMs).toISOString();

  const expiresMs = parse(info.expires);
  const expires = Number.isNaN(expiresMs)
    ? new Date(now + DEFAULT_DURATION_MS).toISOString()
    : new Date(expiresMs).toISOString();

  const headline = String(info.headline ?? "").trim() || `${severity} ${event} for ${areaDesc}`;
  const description = String(info.description ?? "").trim();
  const instruction = String(info.instruction ?? "").trim();
  const senderName = String(info.senderName ?? "MeteoAlarm");

  const featureId = String(feature.id ?? p.OBJECTID ?? `${p.alertId}-${areaIdx}`);

  return {
    alert_id: `MA-${country}-${hash(featureId)}`,
    event,
    severity,
    certainty: String(info.certainty ?? "Likely"),
    urgency: String(info.urgency ?? (onset && Date.parse(onset) > now ? "Future" : "Expected")),
    headline,
    area_desc: areaDesc,
    sent,
    effective: onset ?? sent,
    onset,
    expires_at: expires,
    ends: expires,
    status: String(cap.status ?? "Actual"),
    message_type: String(cap.msgType ?? "Alert"),
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
        capAlertId: String(p.alertId ?? ""),
      },
      affectedZones: [],
    },
  };
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** One page of the warning index. Returns [] on 204 (nothing sent in range). */
async function fetchIndexPage(
  token: string,
  page: number,
  from: string,
  to: string,
  activeFrom: string,
  activeTo: string,
): Promise<Record<string, unknown>[]> {
  const url = new URL(BASE);
  url.searchParams.set("language", "en");
  // `datetime` filters the CAP *sent* time (mandatory, must span < 24h);
  // `active` filters by validity so old-but-still-valid products come back.
  url.searchParams.set("datetime", `${from}/${to}`);
  url.searchParams.set("active", `${activeFrom}/${activeTo}`);
  if (page > 1) url.searchParams.set("page", String(page));

  const res = await fetchJson(url.toString(), {
    Authorization: `Bearer ${token}`,
    Accept: "application/geo+json, application/json",
    "User-Agent": "StormCircle/1.0 (bot@stormcircle.net)",
  });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`MeteoAlarm ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { features?: Record<string, unknown>[] };
  return body.features ?? [];
}

/** Download the CAP documents referenced by the index, with limited concurrency. */
async function fetchCapDocs(links: Map<string, string>): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const entries = [...links.entries()].slice(0, MAX_CAP_DOCS);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CAP_CONCURRENCY, entries.length) }, async () => {
    while (cursor < entries.length) {
      const [alertId, href] = entries[cursor++];
      try {
        const res = await fetchJson(href, { Accept: "application/json" });
        if (res.ok) out.set(alertId, (await res.json()) as Record<string, unknown>);
      } catch (e) {
        console.warn("[meteoalarm-poll] cap fetch failed", alertId, String(e));
      }
    }
  });
  await Promise.all(workers);
  return out;
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

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

  try {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");

    // 1. Index sweep. The API caps each `datetime` range at < 24h, so we walk
    //    SWEEP_WINDOWS consecutive 23h windows backwards and keep anything
    //    still active (or starting within ACTIVE_AHEAD_DAYS).
    const activeFrom = iso(now);
    const activeTo = iso(now + ACTIVE_AHEAD_DAYS * 24 * 3600_000);
    const features: Record<string, unknown>[] = [];
    const seenFeature = new Set<string>();
    for (let w = 0; w < SWEEP_WINDOWS; w++) {
      const hi = iso(now - w * SWEEP_HOURS * 3600_000);
      const lo = iso(now - (w + 1) * SWEEP_HOURS * 3600_000);
      for (let page = 0; page < MAX_PAGES; page++) {
        let batch: Record<string, unknown>[];
        try {
          batch = await fetchIndexPage(token, page + 1, lo, hi, activeFrom, activeTo);
        } catch (e) {
          console.warn("[meteoalarm-poll] index page failed", w, page, String(e));
          break;
        }
        for (const f of batch) {
          const key = String(f.id ?? JSON.stringify((f.properties ?? {})));
          if (seenFeature.has(key)) continue;
          seenFeature.add(key);
          features.push(f);
        }
        if (batch.length < PAGE_SIZE) break;
      }
    }

    // 2. CAP documents, one per distinct alert.
    const capLinks = new Map<string, string>();
    for (const f of features) {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      const alertId = String(p.alertId ?? "");
      if (!alertId || capLinks.has(alertId)) continue;
      const links = (f.links as { rel?: string; type?: string; href?: string }[] | undefined) ?? [];
      const json = links.find((l) => l.rel === "json" || l.type === "application/json");
      if (json?.href) capLinks.set(alertId, json.href);
    }
    const caps = await fetchCapDocs(capLinks);

    // 3. Rows.
    const byId = new Map<string, Row>();
    for (const f of features) {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      const cap = caps.get(String(p.alertId ?? ""));
      if (!cap) continue;
      const row = buildRow(f, cap, now);
      if (!row) continue;
      if (Date.parse(row.expires_at) <= now) continue;
      byId.set(row.alert_id, row);
    }

    const nowIso = new Date(now).toISOString();
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

    for (let i = 0; i < rows.length; i += 300) {
      const { error } = await supabase
        .from("active_alerts")
        .upsert(rows.slice(i, i + 300), { onConflict: "alert_id" });
      if (error) console.warn("[meteoalarm-poll] upsert err:", error);
    }

    // Warnings that dropped out of the sweep or expired are removed.
    const currentIds = new Set(rows.map((r) => r.alert_id));
    const toDelete = (existing ?? [])
      .map((r: { alert_id: string }) => r.alert_id)
      .filter((id: string) => !currentIds.has(id));
    for (let i = 0; i < toDelete.length; i += 300) {
      await supabase.from("active_alerts").delete().in("alert_id", toDelete.slice(i, i + 300));
    }

    return new Response(
      JSON.stringify({
        ok: true,
        features: features.length,
        caps: caps.size,
        active: rows.length,
        deleted: toDelete.length,
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
