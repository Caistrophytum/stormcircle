// nhc-poll: scheduled fetch of NHC CurrentStorms.json + hurricane season status.
// Replaces client-side useHurricaneData / useHurricaneBot polling.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
import { createClient } from "npm:@supabase/supabase-js@2";

const NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";
const HURRICANE_BOT_ID = "00000000-0000-0000-0000-000000000001";
const STATUS_MARKER = "<!--htype:season-->";

const CLASSIFICATIONS: Record<string, string> = {
  TD: "Tropical Depression", TS: "Tropical Storm", HU: "Hurricane", TY: "Typhoon", STY: "Super Typhoon",
  TC: "Tropical Cyclone", STD: "Subtropical Depression", STS: "Subtropical Storm",
  EX: "Post-Tropical Cyclone", LO: "Low", DB: "Disturbance",
};

function getDangerLevel(c: string, i: number): string {
  if (c === "HU" && i >= 96) return "MAJOR HURRICANE";
  if (c === "HU") return "HURRICANE";
  if (c === "TS" && i >= 55) return "STRONG TROPICAL STORM";
  if (c === "TS") return "TROPICAL STORM";
  return "WATCH";
}
function degToCompass(d: number): string {
  return ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(d/22.5)%16];
}
function parseNum(v: any, f = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : f;
  if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : f; }
  return f;
}
function isSeasonActive() {
  const n = new Date(); const m = n.getUTCMonth()+1; const d = n.getUTCDate();
  const atl = (m>=6 && m<=11) || (m===5 && d>=15);
  const pac = m>=5 && m<=11;
  return {
    active: atl || pac,
    basin: atl && pac ? "Atlantic & Eastern Pacific" : atl ? "Atlantic" : pac ? "Eastern Pacific" : "None",
  };
}

interface NormStorm {
  storm_id: string; name: string; classification: string; classification_label: string;
  intensity_kt: number; intensity_mph: number; pressure: number;
  lat: number; lon: number; lat_str: string; lon_str: string;
  movement_dir_compass: string; movement_speed: number;
  is_dangerous: boolean; danger_level: string;
  advisory_url: string; discussion_url: string; forecast_graphics_url: string;
  last_update: string;
}

function normalize(raw: any): NormStorm | null {
  const id = raw.id ?? raw.binNumber;
  const name = raw.name;
  const classification = (raw.classification ?? "").toUpperCase();
  if (!id || !name || !classification) return null;
  const intensity = Math.round(parseNum(raw.intensity));
  const pressure = Math.round(parseNum(raw.pressure));
  const lat = parseNum(raw.latitudeNumeric ?? raw.latitude);
  const lon = parseNum(raw.longitudeNumeric ?? raw.longitude);
  const movementDir = parseNum(raw.movementDir);
  const movementSpeed = parseNum(raw.movementSpeed);
  const lastUpdate = raw.lastUpdate ? new Date(raw.lastUpdate) : new Date();
  return {
    storm_id: String(id), name, classification,
    classification_label: CLASSIFICATIONS[classification] ?? classification,
    intensity_kt: intensity, intensity_mph: Math.round(intensity * 1.151), pressure,
    lat, lon,
    lat_str: `${Math.abs(lat).toFixed(1)}${lat >= 0 ? "N" : "S"}`,
    lon_str: `${Math.abs(lon).toFixed(1)}${lon >= 0 ? "E" : "W"}`,
    movement_dir_compass: degToCompass(movementDir), movement_speed: movementSpeed,
    is_dangerous: classification === "HU" || classification === "TY" || classification === "STY" || intensity >= 50,
    danger_level: getDangerLevel(classification, intensity),
    advisory_url: raw.publicAdvisory?.url ?? "",
    discussion_url: raw.forecastDiscussion?.url ?? "",
    forecast_graphics_url: raw.forecastGraphics?.url ?? raw.trackCone?.url ?? "",
    last_update: lastUpdate.toISOString(),
  };
}

function fmtAdv(d: Date): string {
  const m = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const day = d.getUTCDate(); const y = d.getUTCFullYear();
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${m} ${day}, ${y}. ${h}z`;
}

// Small helper: fetch with an AbortController-backed timeout so a slow
// NHC endpoint can't stall the entire edge invocation up to the runtime
// wall-clock kill.
async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

// Fetch the NHC Public Advisory and pull out its one-line headline
// (the "...HEADLINE GOES HERE..." line that sits right above the SUMMARY).
// Kept defensive — returns null on any failure so the bot still posts.
async function fetchAdvisoryHeadline(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetchWithTimeout(url, 6_000);
    if (!r.ok) return null;
    const html = await r.text();
    const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1] ?? html;
    const text = pre.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    // Headlines look like: ...AMANDA SHOWING LITTLE CHANGE IN STRENGTH...
    const m = text.match(/^\s*\.\.\.([^.\n][^\n]*?)\.\.\.\s*$/m);
    if (!m) return null;
    const headline = m[1].trim().replace(/\s+/g, " ");
    // Title-case so it doesn't shout inside the card.
    return headline.length > 120 ? headline.slice(0, 118) + "…" : headline;
  } catch { return null; }
}

function advisoryMsg(s: NormStorm, isNew: boolean, headline: string | null): string {
  const header = isNew ? `🌀 NEW STORM: ${s.name} — ${s.classification_label}` : `🌀 ADVISORY UPDATE: ${s.name}`;
  return [header,
    headline ? `📢 ${headline}` : ``,
    ``,
    `Classification: ${s.classification_label}`,
    `Location: ${s.lat_str}, ${s.lon_str}`,
    `Max Winds: ${s.intensity_mph} mph (${s.intensity_kt} kt)`,
    `Pressure: ${s.pressure} mb`,
    `Movement: ${s.movement_dir_compass} at ${Math.round(s.movement_speed * 1.151)} mph`,
    ``,
    s.is_dangerous && s.forecast_graphics_url
      ? `⚠️ DANGEROUS STORM — See forecast: ${s.forecast_graphics_url}`
      : ``,
    `<!--hadv:${s.storm_id}:${s.last_update}-->`,
  ].filter(Boolean).join("\n");
}
function dangerMsg(s: NormStorm, headline: string | null): string {
  return [`🔴 ${s.danger_level}: ${s.name.toUpperCase()}`,
    headline ? `📢 ${headline}` : ``,
    ``,
    `Winds: ${s.intensity_mph} mph — Pressure: ${s.pressure} mb`,
    `Current position: ${s.lat_str}, ${s.lon_str}`,
    `Moving: ${s.movement_dir_compass} at ${Math.round(s.movement_speed * 1.151)} mph`, ``,
    s.discussion_url ? `📊 Forecast discussion: ${s.discussion_url}` : ``,
    s.forecast_graphics_url ? `🗺️ Forecast graphics: ${s.forecast_graphics_url}` : ``,
    `<!--hadv:${s.storm_id}:danger:${s.last_update}-->`,
  ].filter(Boolean).join("\n");
}

async function buildEnsoLine(supabase: any): Promise<string | null> {
  const { data } = await supabase.from("enso_state").select("*").eq("id", 1).maybeSingle();
  if (!data || typeof data.oni !== "number") return null;
  const sign = data.oni > 0 ? "+" : "";
  const region = data.region ?? "ONI";
  const season = String(data.season ?? "").trim();
  const year = String(data.year ?? "").trim();
  const period = data.source === "weekly"
    ? season
    : (season.includes(year) ? season : `${season} ${year}`.trim());
  return `ENSO: ${data.phase} (${data.lean}, ${region} ${sign}${Number(data.oni).toFixed(2)} °C, ${period})`;
}

async function postBot(supabase: any, content: string) {
  const { error } = await supabase.from("messages").insert({
    user_id: HURRICANE_BOT_ID, username: "Hurricane Bot", badge: "System", content,
  });
  if (error) console.warn("[nhc-poll] insert failed:", error);
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
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

  try {
    // Reliability: 15s hard timeout around the NHC JSON fetch so an
    // upstream stall can't burn the whole edge-function invocation.
    const res = await fetchWithTimeout(NHC_URL, 15_000);
    if (!res.ok) throw new Error(`NHC ${res.status}`);
    const json = await res.json();
    const raws: any[] = Array.isArray(json?.activeStorms) ? json.activeStorms : [];
    const storms: NormStorm[] = raws.map(normalize).filter((s): s is NormStorm => s !== null);

    // Load existing storms from DB
    const { data: existing } = await supabase.from("nhc_storms").select("storm_id, last_update");
    const existingMap = new Map<string, string>((existing ?? []).map((r: any) => [r.storm_id, r.last_update]));

    // Perf: classify once, then do all IO in parallel batches.
    // Previously we awaited upsert → headline fetch → 1-2 bot inserts
    // sequentially per storm (5-storm season = ~20 serial round-trips).
    const changed: NormStorm[] = [];
    const newIds = new Set<string>();
    for (const s of storms) {
      const prev = existingMap.get(s.storm_id);
      const isNew = !prev;
      const isChanged = isNew || new Date(s.last_update).getTime() !== new Date(prev!).getTime();
      if (isChanged) changed.push(s);
      if (isNew) newIds.add(s.storm_id);
    }

    const nowIso = new Date().toISOString();
    // Batch upsert every storm in one round-trip.
    if (storms.length > 0) {
      const { error: upsertErr } = await supabase
        .from("nhc_storms")
        .upsert(storms.map((s) => ({ ...s, updated_at: nowIso })));
      if (upsertErr) console.warn("[nhc-poll] batch upsert failed:", upsertErr);
    }

    // Fetch all advisory headlines in parallel (each with its own 6s
    // timeout so one slow storm page can't block the others).
    const headlines = await Promise.all(
      changed.map((s) => fetchAdvisoryHeadline(s.advisory_url)),
    );

    // Build all bot messages, then insert in a single call.
    const botRows: { user_id: string; username: string; badge: string; content: string }[] = [];
    changed.forEach((s, i) => {
      const headline = headlines[i];
      botRows.push({
        user_id: HURRICANE_BOT_ID, username: "Hurricane Bot", badge: "System",
        content: advisoryMsg(s, newIds.has(s.storm_id), headline),
      });
      if (s.is_dangerous) {
        botRows.push({
          user_id: HURRICANE_BOT_ID, username: "Hurricane Bot", badge: "System",
          content: dangerMsg(s, headline),
        });
      }
    });
    if (botRows.length > 0) {
      const { error: insErr } = await supabase.from("messages").insert(botRows);
      if (insErr) console.warn("[nhc-poll] bot insert failed:", insErr);
    }

    // Remove storms NHC dropped — single .in() delete instead of N deletes.
    const currentIds = new Set(storms.map((s) => s.storm_id));
    const removedIds = Array.from(existingMap.keys()).filter((id) => !currentIds.has(id));
    if (removedIds.length > 0) {
      const { error: delErr } = await supabase
        .from("nhc_storms").delete().in("storm_id", removedIds);
      if (delErr) console.warn("[nhc-poll] batch delete failed:", delErr);
    }

    // Season status repost (once per 6h)
    const { data: statusRow } = await supabase.from("messages")
      .select("id, content, created_at")
      .eq("user_id", HURRICANE_BOT_ID)
      .ilike("content", `%${STATUS_MARKER}%`)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const shouldRepost = !statusRow ||
      (Date.now() - new Date(statusRow.created_at).getTime() > 6 * 60 * 60 * 1000) ||
      !statusRow.content.includes("ENSO:") ||
      !(statusRow.content.includes("Niño 3.4") || statusRow.content.includes("week of"));

    if (shouldRepost) {
      if (statusRow) await supabase.from("messages").delete().eq("id", statusRow.id);
      const season = isSeasonActive();
      const ensoLine = await buildEnsoLine(supabase);
      const lastAdvisory = storms.length > 0
        ? new Date(Math.max(...storms.map((s) => new Date(s.last_update).getTime()))) : null;
      let body: string;
      if (!season.active && storms.length === 0) {
        body = [`🌀 HURRICANE SEASON STATUS`, ``,
          `No active hurricane seasons at this time.`, `No active tropical cyclones.`,
          ensoLine ?? ``, STATUS_MARKER].filter(Boolean).join("\n");
      } else {
        body = [`🌀 HURRICANE SEASON STATUS`, ``,
          `${season.basin} season is ${season.active ? "ACTIVE" : "INACTIVE"}.`,
          `Current active storms: ${storms.length}`,
          lastAdvisory ? `Last advisory: ${fmtAdv(lastAdvisory)}` : `Last advisory: —`,
          ensoLine ?? ``, STATUS_MARKER].filter(Boolean).join("\n");
      }
      await postBot(supabase, body);
    }

    // Housekeeping: prevent bot messages from stacking up indefinitely.
    // Delete hurricane bot messages older than 14 days (keeps recent history,
    // current status repost is always fresh).
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("messages")
      .delete()
      .eq("user_id", HURRICANE_BOT_ID)
      .lt("created_at", cutoff);

    return new Response(JSON.stringify({ ok: true, storms: storms.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[nhc-poll]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
