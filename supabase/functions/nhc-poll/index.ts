// nhc-poll: scheduled fetch of NHC CurrentStorms.json + hurricane season status.
// Replaces client-side useHurricaneData / useHurricaneBot polling.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
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

function advisoryMsg(s: NormStorm, isNew: boolean): string {
  const header = isNew ? `🌀 NEW STORM: ${s.name} — ${s.classification_label}` : `🌀 ADVISORY UPDATE: ${s.name}`;
  return [header, ``,
    `Classification: ${s.classification_label}`,
    `Location: ${s.lat_str}, ${s.lon_str}`,
    `Max Winds: ${s.intensity_mph} mph (${s.intensity_kt} kt)`,
    `Pressure: ${s.pressure} mb`,
    `Movement: ${s.movement_dir_compass} at ${Math.round(s.movement_speed * 1.151)} mph`,
    ``,
    s.is_dangerous && s.forecast_graphics_url
      ? `⚠️ DANGEROUS STORM — See forecast: ${s.forecast_graphics_url}`
      : s.advisory_url ? `Advisory: ${s.advisory_url}` : ``,
    `<!--hadv:${s.storm_id}:${s.last_update}-->`,
  ].filter(Boolean).join("\n");
}
function dangerMsg(s: NormStorm): string {
  return [`🔴 ${s.danger_level}: ${s.name.toUpperCase()}`, ``,
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
  const period = data.source === "weekly" ? data.season : `${data.season} ${data.year}`;
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
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const res = await fetch(NHC_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`NHC ${res.status}`);
    const json = await res.json();
    const raws: any[] = Array.isArray(json?.activeStorms) ? json.activeStorms : [];
    const storms: NormStorm[] = raws.map(normalize).filter((s): s is NormStorm => s !== null);

    // Load existing storms from DB
    const { data: existing } = await supabase.from("nhc_storms").select("storm_id, last_update");
    const existingMap = new Map<string, string>((existing ?? []).map((r: any) => [r.storm_id, r.last_update]));

    // Upsert + post messages for new/updated storms
    for (const s of storms) {
      const prev = existingMap.get(s.storm_id);
      const isNew = !prev;
      const changed = isNew || new Date(s.last_update).getTime() !== new Date(prev!).getTime();
      await supabase.from("nhc_storms").upsert({ ...s, updated_at: new Date().toISOString() });
      if (changed) {
        await postBot(supabase, advisoryMsg(s, isNew));
        if (s.is_dangerous) await postBot(supabase, dangerMsg(s));
      }
    }

    // Remove storms NHC dropped
    const currentIds = new Set(storms.map((s) => s.storm_id));
    for (const id of existingMap.keys()) {
      if (!currentIds.has(id)) {
        await supabase.from("nhc_storms").delete().eq("storm_id", id);
      }
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
