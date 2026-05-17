// spc-poll: scheduled fetch of SPC Day 1 Convective Outlook.
// Runs server-side via pg_cron so the SPC bot stays current even when no
// one has the app open. Replaces the client-side polling in useSPCOutlook.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
import { createClient } from "npm:@supabase/supabase-js@2";

const SPC_GEOJSON =
  "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query?where=1%3D1&outFields=LABEL,LABEL2,ISSUE,EXPIRE&returnGeometry=true&f=geojson";
const SPC_TXT = "https://www.spc.noaa.gov/products/outlook/day1otlk.txt";
const BOT_USER_ID = "00000000-0000-0000-0000-000000000000";
const MAX_SAMPLES_PER_POLYGON = 4;
const REVERSE_GEOCODE_DELAY_MS = 150;
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
function samplePoints(g: Geom): [number, number][] {
  const [minX, minY, maxX, maxY] = bbox(g);
  const grid = Math.max(3, Math.ceil(Math.sqrt(MAX_SAMPLES_PER_POLYGON * 2)));
  const out: [number, number][] = [];
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
    const x = minX + ((maxX - minX) * (i + 0.5)) / grid;
    const y = minY + ((maxY - minY) * (j + 0.5)) / grid;
    if (pointInGeom([x, y], g)) out.push([x, y]);
  }
  if (out.length > MAX_SAMPLES_PER_POLYGON) {
    const step = out.length / MAX_SAMPLES_PER_POLYGON;
    return Array.from({ length: MAX_SAMPLES_PER_POLYGON }, (_, k) => out[Math.floor(k * step)]);
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

async function fetchTiming(): Promise<{ timing: string | null; validWindow: { startZ: string; endZ: string } | null }> {
  try {
    const res = await fetch(SPC_TXT, { cache: "no-store" });
    if (!res.ok) return { timing: null, validWindow: null };
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
    if (!t) return { timing: null, validWindow };
    return { timing: t.length > 220 ? t.slice(0, 217) + "..." : t, validWindow };
  } catch { return { timing: null, validWindow: null }; }
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

// Synthesize the short prose summary that the bot posts as its visible
// message body. Mirrors SystemMessageCard's expectedSentence logic so the
// chat row and the rendered card tell the same story.
function synthesizeSentence(
  groups: any[],
  timing: string | null,
  validWindow: { startZ: string; endZ: string } | null,
): string {
  const TIER_ORDER = ["MRGL", "SLGT", "ENH", "MDT", "HIGH"];
  const TIER_NAMES: Record<string, string> = {
    MRGL: "Marginal risk", SLGT: "Slight risk", ENH: "Enhanced risk",
    MDT: "Moderate risk", HIGH: "High risk",
  };
  const TIER_SHORT: Record<string, string> = {
    HIGH: "High", MDT: "Moderate", ENH: "Enhanced", SLGT: "Slight", MRGL: "Marginal",
  };
  const presentTiers = [...new Set(groups.map((g) => g.label))]
    .filter((t) => TIER_ORDER.includes(t))
    .sort((a, b) => TIER_ORDER.indexOf(b) - TIER_ORDER.indexOf(a));
  const tierPhrase = presentTiers.length === 0
    ? "Severe weather"
    : presentTiers.length === 1
      ? TIER_NAMES[presentTiers[0]] ?? "Severe risk"
      : `${presentTiers.map((t) => TIER_SHORT[t]).join(" → ")} risks`;

  // Top states by county coverage across all risk groups.
  const counts = new Map<string, number>();
  for (const g of groups) for (const c of g.counties ?? []) {
    counts.set(c.state, (counts.get(c.state) ?? 0) + 1);
  }
  const topStates = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s]) => s);
  const region = joinList(topStates);

  // Time window: prefer a Z-range from the discussion sentence, fall back
  // to the official VALID window.
  let expectedTime: string | null = null;
  if (timing) {
    const range = timing.match(/\b(\d{1,2})-(\d{1,2})Z\b/);
    if (range) expectedTime = `${toUtc24(range[1])}–${toUtc24(range[2])}`;
    else {
      const single = timing.match(/\b(\d{1,2})Z\b/);
      if (single) expectedTime = toUtc24(single[1]);
    }
  }
  if (!expectedTime && validWindow) {
    expectedTime = `${toUtc24(validWindow.startZ)}–${toUtc24(validWindow.endZ)}`;
  }
  const time = expectedTime ? `from ${expectedTime}` : null;

  // Per-hazard area + intensity extraction from the discussion sentence.
  type ThreatLine = { hazard: string; qualifier: string | null; area: string | null };
  const threatLines: ThreatLine[] = (() => {
    if (!timing) return [];
    const findQualifier = (c: string): string | null => {
      if (/\bsignificant|strong\b|intense|violent/i.test(c)) return "significant";
      if (/\bwidespread|numerous|outbreak\b/i.test(c)) return "widespread";
      if (/\bscattered\b/i.test(c)) return "scattered";
      if (/\bisolated|a few|few\b/i.test(c)) return "isolated";
      if (/\blarge\b/i.test(c) && /hail/i.test(c)) return "large";
      return null;
    };
    const REGION_RE = /\b(?:[A-Z]{2}|Plains|Midwest|Mid-?South|Mid-?Atlantic|Ohio Valley|Tennessee Valley|Mississippi Valley|Southeast|Northeast|Southwest|Northwest|Gulf Coast|Carolinas|Deep South|Great Lakes|High Plains|Southern Plains|Central Plains|Northern Plains)\b/g;
    const findArea = (c: string): string | null => {
      const m = c.match(REGION_RE);
      if (!m || m.length === 0) return null;
      return [...new Set(m)].slice(0, 3).join(", ");
    };
    const hazards: { hazard: string; re: RegExp }[] = [
      { hazard: "tornadoes", re: /tornado(?:es)?/i },
      { hazard: "hail", re: /hail/i },
      { hazard: "damaging winds", re: /damaging winds?|severe winds?|wind damage|gusts?/i },
    ];
    const clauses = timing.split(/[.;]|,\s+(?=[A-Z])/).map((c) => c.trim()).filter(Boolean);
    const out: ThreatLine[] = [];
    for (const { hazard, re } of hazards) {
      const hits = clauses.filter((c) => re.test(c));
      if (hits.length === 0) continue;
      const qualifier = hits.map((c) => findQualifier(c)).find(Boolean) ?? findQualifier(timing);
      const area = hits.map((c) => findArea(c)).find(Boolean) ?? null;
      out.push({ hazard, qualifier, area });
    }
    return out;
  })();

  const hazardPhrases = threatLines.map((t) => {
    const noun = t.qualifier && t.qualifier !== "large"
      ? `${t.qualifier} ${t.hazard}`
      : t.qualifier === "large" && t.hazard === "hail"
        ? "large hail"
        : t.hazard;
    return t.area ? `${noun} across ${t.area}` : noun;
  });
  const hazardSentence = joinList(hazardPhrases);

  const head = region ? `${tierPhrase} across ${region}` : tierPhrase;
  const headWithTime = time ? `${head} ${time}` : head;
  const tail = hazardSentence ? `, with ${hazardSentence}.` : ".";
  return `${headWithTime}${tail}`;
}

function buildMessage(issue: string, groups: any[], timing: string | null, validWindow: any): string {
  const sentence = synthesizeSentence(groups, timing, validWindow);
  const payload = JSON.stringify({ issue, groups, timing, validWindow });
  return [
    `⚡ SPC Day 1 Outlook Update — ${formatIssueTime(issue)}`,
    ``,
    sentence,
    `<!--issue:${issue}-->`,
    `<!--data:${payload}-->`,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
    const { timing, validWindow } = await fetchTiming();
    const content = buildMessage(latestIssue, groups, timing, validWindow);

    // Persist state
    await supabase.from("spc_outlook_state").update({
      issue: latestIssue, groups, timing, valid_window: validWindow,
      last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", 1);

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
