// spc-poll: scheduled fetch of SPC Day 1 Convective Outlook.
// Runs server-side via pg_cron so the SPC bot stays current even when no
// one has the app open. Replaces the client-side polling in useSPCOutlook.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildSummary,
  summarizeHazardLayer,
  type HazardSummary,
} from "./summary.ts";

// MapServer layer indices for the SPC Day 1 outlooks.
//   1 = Categorical, 3 = Probabilistic Tornado, 5 = Probabilistic Hail,
//   7 = Probabilistic Wind. (Layers 2/4/6 are Conditional Intensity — they
//   contain CIG categories, not probabilities, and using them produces
//   nonsense like "2% hail" from a CIG1 polygon.)
const SPC_LAYER_URL = (layer: number) =>
  `https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/${layer}/query?where=1%3D1&outFields=*&returnGeometry=false&f=geojson`;
const SPC_GEOJSON =
  "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query?where=1%3D1&outFields=LABEL,LABEL2,ISSUE,EXPIRE&returnGeometry=true&f=geojson";
const SPC_TXT = "https://www.spc.noaa.gov/products/outlook/day1otlk.txt";
const BOT_USER_ID = "00000000-0000-0000-0000-000000000000";
// Per-polygon reverse-geocode cap. SPC risk polygons routinely span dozens
// of counties across multiple states, so a tiny cap (we used to use 4) is
// misleading — the bot would claim "Enhanced risk across 4 counties" for an
// area covering several states. We sample densely and let the dedupe step
// trim duplicates. Large outbreaks may push us close to the 60s wall clock;
// `samplesForPolygon` scales further down for tiny marginal polygons.
const MAX_SAMPLES_PER_POLYGON = 40;
const MIN_SAMPLES_PER_POLYGON = 8;
const REVERSE_GEOCODE_DELAY_MS = 120;
const UA = "StormCircle/1.0 (bot@stormcircle.net)";

const RISK_LABELS: Record<string, string> = {
  TSTM: "General Thunderstorm",
  MRGL: "Marginal Risk",
  SLGT: "Slight Risk",
  ENH: "Enhanced Risk",
  MDT: "Moderate Risk",
  HIGH: "High Risk",
};
const RISK_RANK: Record<string, number> = { MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5 };

interface Geom { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][]; }
interface Feat { properties: { label?: string; issue?: string }; geometry: Geom; }

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
// Scale samples to the polygon's bbox area (in square degrees). ~1 sample
// per 4 deg² (~roughly per 250km × 250km region) keeps small marginal
// polygons cheap while giving large multi-state Enhanced/Moderate risks the
// resolution they deserve.
function samplesForPolygon(g: Geom): number {
  const [minX, minY, maxX, maxY] = bbox(g);
  const areaSqDeg = Math.max(0, (maxX - minX) * (maxY - minY));
  const target = Math.round(areaSqDeg / 4);
  return Math.max(MIN_SAMPLES_PER_POLYGON, Math.min(MAX_SAMPLES_PER_POLYGON, target));
}

function samplePoints(g: Geom): [number, number][] {
  const target = samplesForPolygon(g);
  const [minX, minY, maxX, maxY] = bbox(g);
  // Oversample candidates (4× target) so after the point-in-polygon test we
  // still have enough valid interior points to hit the target.
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
    const res = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
      headers: { "User-Agent": UA },
    });
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

function formatIssueTime(issue: string): string {
  const y = issue.slice(0, 4), mo = issue.slice(4, 6), d = issue.slice(6, 8), h = issue.slice(8, 10);
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  const f = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${f}. ${h}z`;
}

function extractHazardDiscussion(text: string): string | null {
  const paragraphs = text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\.{3}[^\n]+\.{3}\s*/g, "").replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0)
    .filter((p) => !/^(ZCZC|ACUS01|SPC AC|Day 1 Convective Outlook|NWS Storm Prediction Center|Valid\s+\d{6}Z|\.PREV DISCUSSION|\.\.Lyons|\$\$)/i.test(p));

  const scored = paragraphs
    .map((paragraph) => {
      let score = 0;
      if (/tornado|hail|damaging winds?|gusts?/i.test(paragraph)) score += 4;
      if (/significant|strong tornado|higher-end|very large hail|widespread/i.test(paragraph)) score += 3;
      if (/\b(?:NE|IA|MN|SD|KS|OK|TX|CO|MI|WI|MO)\b|Plains|Midwest|Valley|High Plains|Lower MI|Panhandle/i.test(paragraph)) score += 2;
      if (/summary/i.test(paragraph)) score += 1;
      return { paragraph, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const picked: string[] = [];
  for (const { paragraph } of scored) {
    if (picked.includes(paragraph)) continue;
    picked.push(paragraph);
    if (picked.length === 4) break;
  }

  if (picked.length === 0) return null;
  const joined = picked.join(" ");
  return joined.length > 1400 ? `${joined.slice(0, 1397)}...` : joined;
}

async function fetchProductContext(): Promise<{ timing: string | null; validWindow: { startZ: string; endZ: string } | null; discussion: string | null }> {
  try {
    const res = await fetch(SPC_TXT, { cache: "no-store" });
    if (!res.ok) return { timing: null, validWindow: null, discussion: null };
    const text = await res.text();
    let validWindow: { startZ: string; endZ: string } | null = null;
    const vm = text.match(/VALID\s+\d{2}(\d{4})Z\s*-\s*\d{2}(\d{4})Z/i);
    if (vm) {
      const fmt = (h: string) => `${h.slice(0, 2)}:${h.slice(2)}Z`;
      validWindow = { startZ: fmt(vm[1]), endZ: fmt(vm[2]) };
    }
    const body = text.replace(/VALID\s+\d{6}Z\s*-\s*\d{6}Z/gi, "");
    const sentences = body.split(/(?<=\.)\s+/).map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 20 && s.length < 400);
    const Z_RE = /\b\d{1,2}(?:-\d{1,2})?Z\b/;
    const FIRING_RE = /\b(develop|developing|initiation|initiate|initiating|fire|firing|form|forming|expected to develop|robust convection)\b/i;
    const t = sentences.find((s) => Z_RE.test(s) && FIRING_RE.test(s)) ?? sentences.find((s) => Z_RE.test(s));
    const discussion = extractHazardDiscussion(text);
    if (!t) return { timing: null, validWindow, discussion };
    return { timing: t.length > 220 ? t.slice(0, 217) + "..." : t, validWindow, discussion };
  } catch { return { timing: null, validWindow: null, discussion: null }; }
}

// Convert a Z-time token ("12Z" / "06" / "0600" / "00Z") into "HHZ" (24h
// zulu, midnight = 00, no colon). Matches the in-app card formatting.
function toUtc24(raw: string): string {
  const cleaned = raw.replace(/Z$/i, "");
  let hh: string | null = null;
  if (/^\d{4}$/.test(cleaned)) hh = cleaned.slice(0, 2);
  else if (/^\d{1,2}$/.test(cleaned)) hh = cleaned.padStart(2, "0");
  else if (/^\d{1,2}:\d{2}$/.test(cleaned)) hh = cleaned.split(":")[0].padStart(2, "0");
  if (hh === null) return `${cleaned}Z`;
  return `${(parseInt(hh, 10) % 24).toString().padStart(2, "0")}Z`;
}

function joinList(arr: string[]): string | null {
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
}

async function fetchHazardLayers(): Promise<HazardSummary[]> {
  const out: HazardSummary[] = [];
  const layers: { idx: number; key: HazardSummary["hazard"] }[] = [
    { idx: 3, key: "tornado" },
    { idx: 5, key: "hail" },
    { idx: 7, key: "wind" },
  ];
  for (const { idx, key } of layers) {
    try {
      const res = await fetch(SPC_LAYER_URL(idx));
      if (!res.ok) continue;
      const geo = await res.json();
      const feats = Array.isArray(geo?.features) ? geo.features : [];
      const summary = summarizeHazardLayer(key, feats);
      if (summary) out.push(summary);
    } catch (e) {
      console.warn(`[spc-poll] hazard layer ${idx} fetch failed`, e);
    }
  }
  return out;
}

function buildMessage(
  issue: string,
  groups: any[],
  timing: string | null,
  validWindow: { startZ: string; endZ: string } | null,
  discussion: string | null,
  hazards: HazardSummary[],
): string {
  const summary = buildSummary({
    groups, hazards, timing, discussion, hasValidWindow: !!validWindow,
  });
  const payload = JSON.stringify({
    v: 2,
    issue, groups, timing, validWindow, discussion, summary, hazards,
  });
  return [
    `⚡ SPC Day 1 Outlook Update — ${formatIssueTime(issue)}`,
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
  const authorized =
    auth === `Bearer ${SERVICE_KEY}` ||
    (CRON_SECRET && (cronHeader === CRON_SECRET || auth === `Bearer ${CRON_SECRET}`));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

  try {
    const res = await fetch(SPC_GEOJSON);
    if (!res.ok) throw new Error(`SPC ${res.status}`);
    const geo = await res.json();
    const features: Feat[] = Array.isArray(geo?.features) ? geo.features : [];
    if (!features.length) throw new Error("no features");

    const issues = features.map((f) => f.properties?.issue).filter((v): v is string => !!v && v.length >= 12);
    if (!issues.length) throw new Error("no issue timestamps");
    const latestIssue = issues.sort().reverse()[0];

    // Check stored state — skip when issue hasn't changed unless caller
    // explicitly asks for a re-post via ?force=1 (used when the visible
    // message template changes and we need to refresh the existing row).
    const force = new URL(req.url).searchParams.get("force") === "1";
    const { data: stored } = await supabase.from("spc_outlook_state").select("issue").eq("id", 1).maybeSingle();
    if (!force && stored?.issue === latestIssue) {
      await supabase.from("spc_outlook_state").update({ last_run_at: new Date().toISOString(), last_error: null }).eq("id", 1);
      return new Response(JSON.stringify({ ok: true, unchanged: true, issue: latestIssue }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const relevant = features.filter((f) => {
      const l = f.properties?.label;
      return f.properties?.issue === latestIssue && l && l !== "TSTM" && RISK_LABELS[l];
    });

    if (!relevant.length) {
      // Quiet day at new issuance — record so we don't reprocess.
      await supabase.from("spc_outlook_state").update({
        issue: latestIssue, groups: [], timing: null, valid_window: null,
        last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
      }).eq("id", 1);
      return new Response(JSON.stringify({ ok: true, issue: latestIssue, quiet: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const groups: any[] = [];
    for (const feat of relevant) {
      const samples = samplePoints(feat.geometry);
      const seen = new Set<string>();
      const counties: { county: string; state: string }[] = [];
      for (const [lon, lat] of samples) {
        const p = await reverseGeocode(lat, lon);
        await delay(REVERSE_GEOCODE_DELAY_MS);
        if (!p) continue;
        const key = `${p.county}|${p.state}`;
        if (seen.has(key)) continue;
        seen.add(key);
        counties.push(p);
      }
      if (!counties.length) continue;
      counties.sort((a, b) => a.state === b.state ? a.county.localeCompare(b.county) : a.state.localeCompare(b.state));
      const label = feat.properties.label!;
      groups.push({ label, riskLabel: RISK_LABELS[label], counties });
    }

    if (!groups.length) {
      await supabase.from("spc_outlook_state").update({
        issue: latestIssue, last_run_at: new Date().toISOString(), last_error: null,
      }).eq("id", 1);
      return new Response(JSON.stringify({ ok: true, issue: latestIssue, no_counties: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    groups.sort((a, b) => (RISK_RANK[b.label] ?? 0) - (RISK_RANK[a.label] ?? 0));
    const [{ timing, validWindow, discussion }, hazards] = await Promise.all([
      fetchProductContext(),
      fetchHazardLayers(),
    ]);
    const content = buildMessage(latestIssue, groups, timing, validWindow, discussion, hazards);

    // Persist state. `hazards` is a newly added column — wrap in a fallback
    // so we don't break the run on environments where the migration hasn't
    // landed yet.
    const baseUpdate = {
      issue: latestIssue, groups, timing, valid_window: validWindow,
      last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    };
    const withHazards = await supabase.from("spc_outlook_state")
      .update({ ...baseUpdate, hazards }).eq("id", 1);
    if (withHazards.error) {
      console.warn("[spc-poll] hazards column write failed, retrying without it:", withHazards.error.message);
      await supabase.from("spc_outlook_state").update(baseUpdate).eq("id", 1);
    }

    // Replace bot message
    await supabase.from("messages").delete().eq("user_id", BOT_USER_ID);
    const { error: insErr } = await supabase.from("messages").insert({
      user_id: BOT_USER_ID, username: "SPC Bot", badge: "System", content,
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, issue: latestIssue, posted: true, groups: groups.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[spc-poll]", e);
    await supabase.from("spc_outlook_state").update({
      last_run_at: new Date().toISOString(), last_error: String(e),
    }).eq("id", 1);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
