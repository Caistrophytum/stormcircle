// fire-poll: scheduled fetch of SPC Day 1 Fire Weather Outlook.
// Posts a "Fire Weather Bot" system message structured similarly to the
// SPC convective bot, listing categorical fire-weather risk areas, dry
// thunderstorm areas, and the driving parameters (RH, wind, fuels).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "npm:@supabase/supabase-js@2";

// SPC Fire Weather MapServer (different folder than the convective outlooks).
//   Layer 1 = Day 1 Categorical (dn 5=Elevated, 8=Critical, 10=Extreme)
//   Layer 2 = Day 1 Dry Thunderstorm (dn 5=Isolated, 8=Scattered)
const FIRE_BASE = "https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer";
const CAT_URL = `${FIRE_BASE}/1/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson`;
const DRY_URL = `${FIRE_BASE}/2/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson`;
const FIRE_TXT = "https://www.spc.noaa.gov/products/fire_wx/fwdy1.html";

const BOT_USER_ID = "00000000-0000-0000-0000-000000000002";
const UA = "StormCircle/1.0 (bot@stormcircle.net)";

const MAX_SAMPLES_PER_POLYGON = 30;
const MIN_SAMPLES_PER_POLYGON = 6;
const REVERSE_GEOCODE_DELAY_MS = 120;

const CAT_LABELS: Record<number, { code: string; label: string; rank: number }> = {
  5:  { code: "ELEV", label: "Elevated",  rank: 1 },
  8:  { code: "CRIT", label: "Critical",  rank: 2 },
  10: { code: "EXTM", label: "Extreme",   rank: 3 },
};
const DRY_LABELS: Record<number, { code: string; label: string; rank: number }> = {
  5: { code: "IDRT", label: "Isolated Dry Thunderstorm",  rank: 1 },
  8: { code: "SDRT", label: "Scattered Dry Thunderstorm", rank: 2 },
};

interface Geom { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][]; }
interface Feat { properties: Record<string, unknown>; geometry: Geom; }

// ─── polygon helpers (duplicated from spc-poll to keep that file untouched) ──
function pointInRing(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    const intersect = (yi > pt[1]) !== (yj > pt[1]) &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointInGeom(pt: [number, number], g: Geom): boolean {
  const polys = g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
  for (const poly of polys) {
    if (!poly.length || !pointInRing(pt, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (pointInRing(pt, poly[h])) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}
function bbox(g: Geom): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (rings: number[][][]) => { for (const r of rings) for (const [x, y] of r) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  } };
  if (g.type === "Polygon") visit(g.coordinates as number[][][]);
  else for (const p of g.coordinates as number[][][][]) visit(p);
  return [minX, minY, maxX, maxY];
}
function samplesForPolygon(g: Geom): number {
  const [minX, minY, maxX, maxY] = bbox(g);
  const area = Math.max(0, (maxX - minX) * (maxY - minY));
  const target = Math.round(area / 4);
  return Math.max(MIN_SAMPLES_PER_POLYGON, Math.min(MAX_SAMPLES_PER_POLYGON, target));
}
function samplePoints(g: Geom): [number, number][] {
  const target = samplesForPolygon(g);
  const [minX, minY, maxX, maxY] = bbox(g);
  const grid = Math.max(4, Math.ceil(Math.sqrt(target * 4)));
  const out: [number, number][] = [];
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
    const x = minX + ((maxX - minX) * (i + 0.5)) / grid;
    const y = minY + ((maxY - minY) * (j + 0.5)) / grid;
    if (pointInGeom([x, y], g)) out.push([x, y]);
  }
  if (out.length > target) {
    const step = out.length / target;
    return Array.from({ length: target }, (_, k) => out[Math.floor(k * step)]);
  }
  return out;
}

async function reverseGeocode(lat: number, lon: number): Promise<{ county: string; state: string } | null> {
  try {
    const res = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const data = await res.json();
    const state = data?.properties?.relativeLocation?.properties?.state;
    const countyUrl = data?.properties?.county;
    if (!state || !countyUrl) return null;
    const zr = await fetch(countyUrl, { headers: { "User-Agent": UA } });
    if (!zr.ok) return null;
    const zone = await zr.json();
    const name = zone?.properties?.name;
    return name ? { county: name, state } : null;
  } catch { return null; }
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── formatting ─────────────────────────────────────────────────────────────
function formatIssueTime(valid: string): string {
  // valid is YYYYMMDDHHMM in UTC.
  const y = valid.slice(0, 4), mo = valid.slice(4, 6), d = valid.slice(6, 8), h = valid.slice(8, 10);
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  const f = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${f}. ${h}z`;
}

// ─── parameter extraction from the text product ─────────────────────────────
interface FireHazard {
  kind: "rh" | "wind" | "fuels" | "dry_thunder";
  label: string;
  value: string;
  severity: "low" | "med" | "high";
}

function extractHazards(text: string, hasDry: { iso: boolean; sct: boolean }): { hazards: FireHazard[]; discussion: string | null; validWindow: { startZ: string; endZ: string } | null } {
  const flat = text
    .replace(/\r/g, "")
    .replace(/<!--[\s\S]*?-->/g, " ")   // strip HTML comments first (can contain '>' that break tag regex)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/--!?>/g, " ")            // belt-and-suspenders: kill any stray '-->'
    .replace(/\s+/g, " ");

  let validWindow: { startZ: string; endZ: string } | null = null;
  const vm = flat.match(/VALID\s+\d{2}(\d{4})Z\s*-\s*\d{2}(\d{4})Z/i);
  if (vm) {
    const fmt = (h: string) => `${h.slice(0, 2)}:${h.slice(2)}Z`;
    validWindow = { startZ: fmt(vm[1]), endZ: fmt(vm[2]) };
  }

  const hazards: FireHazard[] = [];

  // Min RH: look for "RH ... 10%", "RH values 8-12%", "minimum RH near 10 percent"
  const rh = flat.match(/(?:min(?:imum)?\s+)?RH[^.\d]{0,40}?(\d{1,2})\s*[-–to]{1,3}\s*(\d{1,2})\s*(?:%|percent)/i)
         ?? flat.match(/RH[^.\d]{0,40}?(?:near|around|as low as|below|<=?|of)\s*(\d{1,2})\s*(?:%|percent)/i)
         ?? flat.match(/(\d{1,2})\s*(?:%|percent)\s+RH/i);
  if (rh) {
    const a = parseInt(rh[1], 10);
    const b = rh[2] ? parseInt(rh[2], 10) : a;
    const lo = Math.min(a, b);
    const val = rh[2] ? `${lo}-${Math.max(a, b)}%` : `≤${a}%`;
    const sev: FireHazard["severity"] = lo <= 10 ? "high" : lo <= 15 ? "med" : "low";
    hazards.push({ kind: "rh", label: "Min RH", value: val, severity: sev });
  }

  // Sustained wind / gusts: "winds 20-30 mph, gusts to 45 mph"
  const wind = flat.match(/gusts?\s+(?:to|of|up to|near|around)\s+(\d{2,3})\s*(?:mph|kt)/i)
           ?? flat.match(/winds?\s+(?:of|sustained|around|near)?\s*(\d{2,3})\s*[-–to]{1,3}\s*(\d{2,3})\s*(?:mph|kt)/i)
           ?? flat.match(/(\d{2,3})\s*(?:mph|kt)\s+(?:winds?|gusts?)/i);
  if (wind) {
    const top = parseInt(wind[2] ?? wind[1], 10);
    const sev: FireHazard["severity"] = top >= 40 ? "high" : top >= 25 ? "med" : "low";
    const label = /gusts?/i.test(wind[0]) ? "Gusts" : "Wind";
    hazards.push({ kind: "wind", label, value: wind[2] ? `${wind[1]}-${wind[2]} mph` : `${wind[1]} mph`, severity: sev });
  }

  // Fuels: ERC / KBDI / "fuels critically dry" / "fuel moisture"
  const fuels = flat.match(/(?:ERC|KBDI)[^.]{0,60}?(?:90th|95th|99th|record|near record|critically|very dry|dry)/i)
            ?? flat.match(/fuels?\s+(?:are|remain|continue to be)?\s*(critically dry|very dry|receptive|cured|dry)/i)
            ?? flat.match(/(?:cured|dormant)\s+(?:fine\s+)?fuels?/i);
  if (fuels) {
    const raw = fuels[0].replace(/\s+/g, " ").trim();
    const sev: FireHazard["severity"] = /critic|record|99th|95th/i.test(raw) ? "high"
                                     : /very dry|90th/i.test(raw) ? "med" : "low";
    const value = raw.length > 40 ? raw.slice(0, 38) + "…" : raw;
    hazards.push({ kind: "fuels", label: "Fuels", value, severity: sev });
  }

  if (hasDry.sct || hasDry.iso) {
    hazards.push({
      kind: "dry_thunder",
      label: "Dry Thunder",
      value: hasDry.sct ? "Scattered" : "Isolated",
      severity: hasDry.sct ? "high" : "med",
    });
  }

  // Discussion: pull a few hazardous-sounding sentences for the expanded view.
  const sentences = flat.split(/(?<=\.)\s+/).map((s) => s.trim()).filter((s) => s.length > 30 && s.length < 400);
  const KEY = /(fire weather|critical|extreme|elevated|dry thunder|fuels|RH|gust|wind|cured|low humidity)/i;
  const picked: string[] = [];
  for (const s of sentences) {
    if (!KEY.test(s)) continue;
    if (picked.includes(s)) continue;
    picked.push(s);
    if (picked.length === 3) break;
  }
  const discussion = picked.length ? (picked.join(" ").slice(0, 1200)) : null;

  return { hazards, discussion, validWindow };
}

async function fetchTextContext(): Promise<{ raw: string }> {
  try {
    const res = await fetch(FIRE_TXT, { cache: "no-store", headers: { "User-Agent": UA } });
    if (!res.ok) return { raw: "" };
    return { raw: await res.text() };
  } catch { return { raw: "" }; }
}

// ─── group building ─────────────────────────────────────────────────────────
interface RiskGroup { label: string; riskLabel: string; counties: { county: string; state: string }[] }

async function buildGroups(
  features: Feat[],
  table: Record<number, { code: string; label: string; rank: number }>,
): Promise<RiskGroup[]> {
  const groups: RiskGroup[] = [];
  // Aggregate counties per (code) across all polygons of that severity.
  const byCode = new Map<string, { riskLabel: string; rank: number; counties: Map<string, { county: string; state: string }> }>();
  for (const f of features) {
    const dn = Number(f.properties?.dn);
    const meta = table[dn];
    if (!meta) continue;
    const samples = samplePoints(f.geometry);
    const bucket = byCode.get(meta.code) ?? { riskLabel: meta.label, rank: meta.rank, counties: new Map() };
    for (const [lon, lat] of samples) {
      const p = await reverseGeocode(lat, lon);
      await delay(REVERSE_GEOCODE_DELAY_MS);
      if (!p) continue;
      const key = `${p.county}|${p.state}`;
      if (!bucket.counties.has(key)) bucket.counties.set(key, p);
    }
    byCode.set(meta.code, bucket);
  }
  for (const [code, b] of byCode) {
    if (b.counties.size === 0) continue;
    const counties = [...b.counties.values()].sort((a, c) => a.state === c.state ? a.county.localeCompare(c.county) : a.state.localeCompare(c.state));
    groups.push({ label: code, riskLabel: b.riskLabel, counties });
  }
  // Highest severity first.
  groups.sort((a, b) => (table[Object.entries(table).find(([, m]) => m.code === b.label)?.[0] as unknown as number] ?? { rank: 0 }).rank
                       - (table[Object.entries(table).find(([, m]) => m.code === a.label)?.[0] as unknown as number] ?? { rank: 0 }).rank);
  return groups;
}

function topStates(groups: RiskGroup[], limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const g of groups) for (const c of g.counties) counts.set(c.state, (counts.get(c.state) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([s]) => s);
}
function joinList(arr: string[]): string | null {
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
}

const NATURAL_PHRASES = [
  "this morning and afternoon", "this afternoon and evening",
  "this evening and overnight", "late tonight and tomorrow morning",
  "tonight and tomorrow morning", "this afternoon", "this evening",
  "tonight", "overnight", "tomorrow morning", "tomorrow afternoon",
  "late afternoon and evening", "late afternoon", "early morning hours",
  "morning hours", "afternoon hours", "evening hours",
];
function extractNaturalTime(discussion: string | null, hasValidWindow: boolean): string | null {
  const src = (discussion ?? "").toLowerCase();
  for (const p of NATURAL_PHRASES) if (src.includes(p)) return p;
  return hasValidWindow ? "today and tonight" : null;
}

function buildSummary(
  groups: RiskGroup[],
  dry: RiskGroup[],
  hazards: FireHazard[],
  discussion: string | null,
  validWindow: { startZ: string; endZ: string } | null,
): string {
  const top = groups[0];
  const region = joinList(topStates([...groups, ...dry])) ?? "parts of the U.S.";
  const tier = top
    ? (top.label === "EXTM" ? "Extreme" : top.label === "CRIT" ? "Critical" : "Elevated")
    : null;
  const time = extractNaturalTime(discussion, !!validWindow);
  const lead = tier
    ? `${tier} fire weather conditions expected across ${region}`
    : `Dry thunderstorm activity possible across ${region}`;
  const leadWithTime = time ? `${lead} ${time}` : lead;
  const drivers: string[] = [];
  const rh = hazards.find((h) => h.kind === "rh"); if (rh) drivers.push(`RH ${rh.value}`);
  const w = hazards.find((h) => h.kind === "wind"); if (w) drivers.push(`${w.label.toLowerCase()} ${w.value}`);
  const f = hazards.find((h) => h.kind === "fuels"); if (f) drivers.push(`fuels ${f.value}`);
  const dt = hazards.find((h) => h.kind === "dry_thunder"); if (dt) drivers.push(`${dt.value.toLowerCase()} dry thunder`);
  const tail = drivers.length ? `, driven by ${joinList(drivers)}.` : ".";
  return `${leadWithTime}${tail}`;
}

function buildMessage(
  issue: string,
  groups: RiskGroup[],
  dryThunder: RiskGroup[],
  hazards: FireHazard[],
  summary: string,
  validWindow: { startZ: string; endZ: string } | null,
  discussion: string | null,
): string {
  // NOTE: `discussion` is intentionally NOT embedded in the message payload.
  // It can contain free-form text scraped from SPC HTML that, even after tag
  // stripping, sometimes includes the literal sequence `-->`, which would
  // prematurely terminate the surrounding `<!--data:...-->` HTML comment and
  // break client-side JSON parsing. The frontend doesn't render it anyway.
  const safeStr = (s: string | null | undefined) => (s ?? "").replace(/--!?>/g, " ");
  const payload = JSON.stringify({
    v: 1, issue, groups, dryThunder, hazards,
    summary: safeStr(summary),
    validWindow,
  });
  return [
    `🔥 SPC Fire Weather Outlook — ${formatIssueTime(issue)}`,
    ``,
    summary,
    `<!--issue:${issue}-->`,
    `<!--data:${payload}-->`,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const authorized = auth === `Bearer ${SERVICE_KEY}` ||
    (CRON_SECRET && (cronHeader === CRON_SECRET || auth === `Bearer ${CRON_SECRET}`));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

  try {
    const [catRes, dryRes] = await Promise.all([fetch(CAT_URL), fetch(DRY_URL)]);
    if (!catRes.ok) throw new Error(`firewx cat ${catRes.status}`);
    if (!dryRes.ok) throw new Error(`firewx dry ${dryRes.status}`);
    const catGeo = await catRes.json();
    const dryGeo = await dryRes.json();
    const catFeats: Feat[] = Array.isArray(catGeo?.features) ? catGeo.features : [];
    const dryFeats: Feat[] = Array.isArray(dryGeo?.features) ? dryGeo.features : [];

    const allValids = [...catFeats, ...dryFeats].map((f) => String(f.properties?.valid ?? ""))
      .filter((v) => v.length >= 12);
    if (!allValids.length) {
      await supabase.from("fire_outlook_state").update({
        last_run_at: new Date().toISOString(), last_error: null,
      }).eq("id", 1);
      return new Response(JSON.stringify({ ok: true, quiet: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const latest = allValids.sort().reverse()[0];

    const force = new URL(req.url).searchParams.get("force") === "1";
    const { data: stored } = await supabase.from("fire_outlook_state").select("issue").eq("id", 1).maybeSingle();
    // Also re-post if the currently stored bot message is on an older payload
    // version (v<2) — earlier payloads embedded `discussion` which sometimes
    // contained '-->' and broke client-side parsing.
    const { data: existingBotMsg } = await supabase
      .from("messages")
      .select("content")
      .eq("user_id", BOT_USER_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const isStaleSchema = !existingBotMsg?.content?.includes('"v":2');
    if (!force && stored?.issue === latest && !isStaleSchema) {
      await supabase.from("fire_outlook_state").update({ last_run_at: new Date().toISOString(), last_error: null }).eq("id", 1);
      return new Response(JSON.stringify({ ok: true, unchanged: true, issue: latest }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const relCat = catFeats.filter((f) => String(f.properties?.valid) === latest && CAT_LABELS[Number(f.properties?.dn)]);
    const relDry = dryFeats.filter((f) => String(f.properties?.valid) === latest && DRY_LABELS[Number(f.properties?.dn)]);

    if (!relCat.length && !relDry.length) {
      await supabase.from("fire_outlook_state").update({
        issue: latest, groups: [], dry_thunder: [], hazards: [], summary: null,
        last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
      }).eq("id", 1);
      // Remove stale bot message on quiet days.
      await supabase.from("messages").delete().eq("user_id", BOT_USER_ID);
      return new Response(JSON.stringify({ ok: true, issue: latest, quiet: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [groups, dryGroups] = [
      await buildGroups(relCat, CAT_LABELS),
      await buildGroups(relDry, DRY_LABELS),
    ];

    const { raw } = await fetchTextContext();
    const hasDry = {
      iso: dryGroups.some((g) => g.label === "IDRT"),
      sct: dryGroups.some((g) => g.label === "SDRT"),
    };
    const { hazards, discussion, validWindow } = extractHazards(raw, hasDry);
    const summary = buildSummary(groups, dryGroups, hazards, discussion, validWindow);
    const content = buildMessage(latest, groups, dryGroups, hazards, summary, validWindow, discussion);

    await supabase.from("fire_outlook_state").update({
      issue: latest, groups, dry_thunder: dryGroups, hazards, summary,
      valid_window: validWindow, discussion,
      last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", 1);

    await supabase.from("messages").delete().eq("user_id", BOT_USER_ID);
    const { error: insErr } = await supabase.from("messages").insert({
      user_id: BOT_USER_ID, username: "Fire Weather Bot", badge: "System", content,
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, issue: latest, posted: true, groups: groups.length, dry: dryGroups.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[fire-poll]", e);
    await supabase.from("fire_outlook_state").update({
      last_run_at: new Date().toISOString(), last_error: String(e),
    }).eq("id", 1);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
