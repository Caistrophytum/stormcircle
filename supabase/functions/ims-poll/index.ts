// ims-poll: scheduled ingest of Israel Meteorological Service (IMS) warnings.
//
// Source: https://ims.gov.il/.../rssAlert_general_country_en.xml
//
// The feed is prose-only — no geometry, no structured fields:
//   "Orange Warning of HEAT STRESS in Bet Shean Valley, in Jordan Valley and
//    in Arava on 03/08 from 10 until 21 LT."
//
// This function parses each item into the same shape the app already uses for
// NWS products and writes it into `active_alerts` with an `IMS-` alert_id
// prefix. Everything downstream (map polygons, "Current location hazards",
// the local alert rectangles) then works unchanged, because those components
// only care about geometry + event + severity.
//
// Region names are resolved to approximate footprints in ./regions.ts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { IMS_REGIONS, ISRAEL_BOX, matchRegion, isWholeCountry, regionsToGeometry } from "./regions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const IMS_URL =
  "https://ims.gov.il/sites/default/files/ims_data/rss/alert/rssAlert_general_country_en.xml";
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_DURATION_MS = 12 * 60 * 60 * 1000;

// ---------------- helpers ----------------

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}

/** UTC offset (in minutes) for Asia/Jerusalem at a given instant. */
function jerusalemOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return Math.round((asUTC - at.getTime()) / 60000);
}

/**
 * Convert a local Israel wall-clock DD/MM HH to a UTC Date.
 * `reference` disambiguates the year and handles year rollover.
 */
function localToUtc(day: number, month: number, hour: number, reference: Date): Date {
  let year = reference.getUTCFullYear();
  // Feed only carries DD/MM. If the parsed date lands far in the past
  // relative to the item's pubDate, it belongs to the next year.
  const guess = (y: number) =>
    new Date(Date.UTC(y, month - 1, day, hour, 0, 0) - jerusalemOffsetMinutes(reference) * 60000);
  let d = guess(year);
  if (d.getTime() - reference.getTime() < -200 * 24 * 3600 * 1000) d = guess(++year);
  if (d.getTime() - reference.getTime() > 200 * 24 * 3600 * 1000) d = guess(--year);
  // Re-resolve with the offset that actually applies on that date (DST edge).
  const off = jerusalemOffsetMinutes(d);
  return new Date(Date.UTC(year, month - 1, day, hour, 0, 0) - off * 60000);
}

export interface ParsedWarning {
  id: string;
  event: string;
  kind: "Warning" | "Watch";
  color: string;
  severity: "Extreme" | "Severe" | "Moderate" | "Minor";
  areas: string[];
  areaDesc: string;
  onset: string | null;
  expires: string;
  sent: string;
  headline: string;
  description: string;
  geometry: unknown;
}

const SEVERITY_BY_COLOR: Record<string, ParsedWarning["severity"]> = {
  red: "Extreme",
  orange: "Severe",
  yellow: "Moderate",
  green: "Minor",
};

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
}

/** Split "A, in B, in C and in D" (or "A and B") into region phrases. */
function splitAreas(raw: string): string[] {
  return raw
    // NOTE: never split on a bare " and " — several IMS region names contain
    // it ("North Judea Desert and Dead Sea", "Centeral and South Coast").
    .split(/,?\s*\band\s+in\s+|,\s*in\s+|\s*;\s*/i)
    .map((s) => s.replace(/^\s*in\s+/i, "").trim())
    .filter(Boolean);
}

/**
 * Parse one description sentence into a structured warning.
 * Returns null when the text doesn't match the IMS warning grammar.
 */
export function parseWarning(
  text: string,
  pubDate: Date,
  fallbackTitle: string,
): Omit<ParsedWarning, "id"> | null {
  const clean = stripTags(decodeEntities(text)).replace(/^update:\s*/i, "").trim();
  if (!clean) return null;

  const m = clean.match(
    /\b(Red|Orange|Yellow|Green)\s+(Early\s+)?(?:Warning|Alert)\s+of\s+([A-Z][A-Z\s\-/]+?)\s+in\s+([\s\S]+?)(?:\s+(?:on|from)\s+([\s\S]+?))?\.?\s*$/i,
  );
  if (!m) return null;

  const color = m[1].toLowerCase();
  const early = Boolean(m[2]);
  const eventRaw = m[3].trim();
  const areaRaw = m[4].trim();
  const timing = (m[5] ?? "").trim();

  const kind: "Warning" | "Watch" = early ? "Watch" : "Warning";
  const event = `${titleCase(eventRaw)} ${kind}`;

  // ----- areas → geometry -----
  const phrases = splitAreas(areaRaw);
  const boxes: Array<[number, number, number, number]> = [];
  const resolved: string[] = [];
  let wholeCountry = false;
  for (const phrase of phrases) {
    if (isWholeCountry(phrase)) {
      wholeCountry = true;
      resolved.push("All of Israel");
      continue;
    }
    const region = matchRegion(phrase);
    if (region) {
      boxes.push(region.box);
      resolved.push(region.name);
    } else {
      resolved.push(phrase);
    }
  }
  const geometry = wholeCountry
    ? regionsToGeometry([ISRAEL_BOX])
    : regionsToGeometry(boxes);
  // Unmatched region names would leave the warning invisible on the map and
  // undetectable for a hometown — skip rather than publish a ghost row.
  if (!geometry) return null;

  // ----- validity window -----
  // Grammar variants:
  //   "on 03/08 from 11 until 15 LT"
  //   "from 30/07 12 until 03/08 20 LT"
  //   "from 03/08 10 until 21 LT"
  let onset: Date | null = null;
  let expires: Date | null = null;

  // The leading "on"/"from" keyword is consumed by the sentence regex above,
  // so `timing` starts at the first date.
  const onFrom = timing.match(/^(\d{1,2})\/(\d{1,2})\s+from\s+(\d{1,2})(?::\d{2})?\s+until\s+(\d{1,2})(?::\d{2})?/i);
  const fromTo = timing.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2})(?::\d{2})?\s+until\s+(\d{1,2})\/(\d{1,2})\s+(\d{1,2})(?::\d{2})?/i);
  const fromSameDay = timing.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2})(?::\d{2})?\s+until\s+(\d{1,2})(?::\d{2})?/i);

  if (onFrom) {
    const [, dd, mm, h1, h2] = onFrom;
    onset = localToUtc(+dd, +mm, +h1, pubDate);
    expires = localToUtc(+dd, +mm, +h2, pubDate);
    if (expires < onset) expires = new Date(expires.getTime() + 24 * 3600 * 1000);
  } else if (fromTo) {
    const [, d1, m1, h1, d2, m2, h2] = fromTo;
    onset = localToUtc(+d1, +m1, +h1, pubDate);
    expires = localToUtc(+d2, +m2, +h2, pubDate);
  } else if (fromSameDay) {
    const [, dd, mm, h1, h2] = fromSameDay;
    onset = localToUtc(+dd, +mm, +h1, pubDate);
    expires = localToUtc(+dd, +mm, +h2, pubDate);
    if (expires < onset) expires = new Date(expires.getTime() + 24 * 3600 * 1000);
  }
  if (!expires || Number.isNaN(expires.getTime())) {
    expires = new Date(pubDate.getTime() + DEFAULT_DURATION_MS);
  }

  const areaDesc = resolved.join("; ");
  return {
    event,
    kind,
    color,
    severity: SEVERITY_BY_COLOR[color] ?? "Moderate",
    areas: resolved,
    areaDesc,
    onset: onset ? onset.toISOString() : null,
    expires: expires.toISOString(),
    sent: pubDate.toISOString(),
    headline: clean,
    description: `${clean} Issued by the Israel Meteorological Service.`,
    geometry,
  };
}

/** Stable id so re-issues of the same product update instead of duplicate. */
function stableId(w: Omit<ParsedWarning, "id">): string {
  const key = `${w.event}|${w.color}|${w.areaDesc}|${w.onset ?? ""}|${w.expires}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return `IMS-${h.toString(36)}`;
}

export function parseFeed(xml: string): ParsedWarning[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const out: ParsedWarning[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const title = tag(item, "title");
    const description = tag(item, "description");
    const pubRaw = tag(item, "pubDate");
    const pubDate = pubRaw ? new Date(pubRaw) : new Date();
    const parsed = parseWarning(description, Number.isNaN(pubDate.getTime()) ? new Date() : pubDate, title);
    if (!parsed) continue;
    const id = stableId(parsed);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, ...parsed });
  }
  return out;
}

// ---------------- handler ----------------

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
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let xml: string;
    try {
      const res = await fetch(IMS_URL, {
        headers: { "User-Agent": "StormCircle/1.0 (bot@stormcircle.net)", Accept: "application/rss+xml, text/xml" },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`IMS ${res.status}`);
      xml = await res.text();
    } finally {
      clearTimeout(timer);
    }

    const warnings = parseFeed(xml);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const live = warnings.filter((w) => new Date(w.expires).getTime() > now);

    const { data: existing } = await supabase
      .from("active_alerts")
      .select("alert_id, first_seen_at")
      .like("alert_id", "IMS-%");
    const firstSeen = new Map<string, string>();
    for (const r of existing ?? []) if (r.first_seen_at) firstSeen.set(r.alert_id, r.first_seen_at);

    const rows = live.map((w) => ({
      alert_id: w.id,
      event: w.event,
      severity: w.severity,
      certainty: "Likely",
      urgency: w.onset && new Date(w.onset).getTime() > now ? "Future" : "Expected",
      headline: w.headline,
      area_desc: w.areaDesc,
      sent: w.sent,
      effective: w.sent,
      onset: w.onset,
      expires_at: w.expires,
      ends: w.expires,
      status: "Actual",
      message_type: "Alert",
      geometry: w.geometry,
      properties: {
        description: w.description,
        headline: w.headline,
        source: "IMS",
        parameters: {
          imsColor: w.color,
          imsRegions: w.areas,
          senderName: "Israel Meteorological Service",
        },
        affectedZones: [],
      },
      updated_at: nowIso,
      first_seen_at: firstSeen.get(w.id) ?? nowIso,
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from("active_alerts").upsert(rows, { onConflict: "alert_id" });
      if (error) console.warn("[ims-poll] upsert err:", error);
    }

    const currentIds = new Set(rows.map((r) => r.alert_id));
    const toDelete = (existing ?? [])
      .map((r: { alert_id: string }) => r.alert_id)
      .filter((id: string) => !currentIds.has(id));
    if (toDelete.length > 0) {
      await supabase.from("active_alerts").delete().in("alert_id", toDelete);
    }

    return new Response(JSON.stringify({
      ok: true, parsed: warnings.length, active: rows.length, deleted: toDelete.length,
      regions: IMS_REGIONS.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[ims-poll]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
