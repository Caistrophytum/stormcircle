/**
 * exerciseComfort — pure scoring for outdoor activity comfort.
 *
 * Framework:
 *   Score = 100 − Σ(weight_i × penalty_i)   [clamped 0–100]
 *   then apply HARD GATES (active NWS alerts) which cap the score.
 *
 * Penalty functions (0–100) are IDENTICAL across activities — only the
 * per-activity weight vector (summing to 1.0) differs. This mirrors the
 * WRS gating philosophy: physical variables produce sub-scores, activity
 * context tunes their importance, and warnings act as hard overrides.
 */

import type { SPCRiskLevel } from "@/hooks/useHomeCityRisk";
import type { FireRiskLevel } from "@/hooks/useHomeCityFireRisk";

export type Activity = "walk" | "run" | "bike" | "hike";

export type ComfortTier =
  | "Ideal"
  | "Good"
  | "Fair"
  | "Poor"
  | "Dangerous";

export interface HourlyPoint {
  /** UTC ISO timestamp for the hour */
  time: string;
  /** °C */
  temperature: number | null;
  /** °C — Open-Meteo "apparent temperature" (heat index / wind chill combined) */
  apparentTemperature: number | null;
  /** % */
  humidity: number | null;
  /** 0..100, chance of precip */
  precipProbability: number | null;
  /** mm/h */
  precipMm: number | null;
  /** m/s */
  windSpeed: number | null;
  /** m/s */
  windGusts: number | null;
  /** dimensionless */
  uvIndex: number | null;
  /** WMO weather code */
  weatherCode: number | null;
}

export interface AQPoint {
  time: string;
  /** US AQI */
  usAqi: number | null;
}

export interface ComfortContext {
  hourly: HourlyPoint[]; // 7 hours: index 0 = current hour, 1..6 next 6
  airQuality: AQPoint[]; // aligned by time (best effort)
  /** Active NWS warning/emergency events covering the home point (deduped by event) */
  activeWarnings: string[];
  spcRisk: SPCRiskLevel;
  fireRisk: FireRiskLevel;
  /** 0–100 WRS threat number from the sounding panel */
  wrs: number;
}

export interface HourResult {
  time: string;
  score: number;      // 0..100
  tier: ComfortTier;
  limiter: string;    // human-readable top limiting factor
}

export interface ActivityResult {
  activity: Activity;
  now: HourResult;
  best: HourResult;         // best hour in the 0..6h window
  series: HourResult[];     // per-hour, length up to 7
}

// ── Tier mapping ────────────────────────────────────────────────────────
function tierFor(score: number): ComfortTier {
  if (score >= 80) return "Ideal";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "Poor";
  return "Dangerous";
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
  y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);

// ── Penalty functions (shared 0–100, activity-agnostic) ─────────────────
// All thresholds below are from published external standards (NWS, EPA,
// WHO, ACSM/NATA, WMO, Beaufort). The mapping from category → 0–100 point
// value is our design choice; the *boundaries* are not.

/**
 * Heat penalty from WBGT (Wet Bulb Globe Temperature).
 * Uses Australian BoM outdoor approximation when no globe thermometer:
 *   e = (RH/100) * 6.105 * exp(17.27*Ta / (237.7+Ta))     [Ta °C, e hPa]
 *   WBGT ≈ 0.567*Ta + 0.393*e + 3.94
 * Tiers per ACSM/NATA flag system (Green/Yellow/Red/Black).
 */
function heatPenalty(tempC: number | null, rh: number | null): number {
  if (tempC == null || rh == null) return 0;
  const e = (clamp(rh, 0, 100) / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  const wbgt = 0.567 * tempC + 0.393 * e + 3.94;
  if (wbgt < 18) return 0;          // Green
  if (wbgt < 23) return 15;         // Yellow
  if (wbgt < 28) return 45;         // Red
  return 85;                         // Black
}

/**
 * Cold penalty from NWS/Environment Canada Wind Chill (2001 formula).
 *   WCT(°F) = 35.74 + 0.6215T − 35.75(V^0.16) + 0.4275T(V^0.16)
 * Valid for T ≤ 50°F, V ≥ 3 mph; otherwise fall back to air temp.
 * Tiers from NWS frostbite-time chart.
 */
function coldPenalty(tempC: number | null, windMs: number | null): number {
  if (tempC == null) return 0;
  const tF = tempC * 9 / 5 + 32;
  const vMph = (windMs ?? 0) * 2.23694;
  let wct = tF;
  if (tF <= 50 && vMph >= 3) {
    const v16 = Math.pow(vMph, 0.16);
    wct = 35.74 + 0.6215 * tF - 35.75 * v16 + 0.4275 * tF * v16;
  }
  if (wct > 0) return 0;
  if (wct > -15) return 25;
  if (wct > -35) return 60;
  return 90;
}

/**
 * Wind penalty per Beaufort scale (uses the stronger of sustained/gust).
 * Inputs m/s → km/h.
 */
function windPenalty(sustainedMs: number | null, gustsMs: number | null): number {
  const s = sustainedMs ?? 0;
  const g = gustsMs ?? s;
  const kmh = Math.max(s, g) * 3.6;
  if (kmh <= 19) return 0;   // Beaufort ≤3
  if (kmh <= 38) return 15;  // Beaufort 4–5
  if (kmh <= 61) return 45;  // Beaufort 6–7
  return 80;                  // Beaufort 8+
}

/**
 * Precipitation penalty per WMO rainfall-intensity classification (mm/h),
 * scaled by probability so a 10% chance of heavy rain isn't full heavy.
 */
function precipPenalty(prob: number | null, mm: number | null): number {
  const rate = mm ?? 0;
  if (rate <= 0) return 0;
  const p = prob == null ? 1 : clamp(prob / 100, 0, 1);
  let base: number;
  if (rate < 2.5) base = 10;         // WMO Light
  else if (rate < 7.6) base = 30;    // WMO Moderate
  else if (rate < 50) base = 60;     // WMO Heavy
  else base = 95;                     // WMO Violent
  // Probability floor of 0.4 so an imminent-but-uncertain forecast still
  // registers something; certain rain gets full weight.
  return base * (0.4 + 0.6 * p);
}

/**
 * Storm/lightning penalty — tiered, not linear.
 * We don't have a live CG-lightning feed, so we proxy proximity using:
 *   • active NWS thunderstorm-family warnings (⇒ TS within ~area)
 *   • SPC categorical outlook covering the home point
 *   • WRS convective threat (>60 ≈ storms likely)
 */
function stormPenalty(
  activeWarnings: string[],
  spc: SPCRiskLevel,
  wrs: number,
): number {
  const warnStr = activeWarnings.join(" | ").toLowerCase();
  if (
    /tornado warning|severe thunderstorm warning|tornado emergency/.test(warnStr) ||
    spc === "MDT" || spc === "HIGH"
  ) return 100;
  if (
    /thunderstorm|flash flood warning/.test(warnStr) ||
    spc === "ENH"
  ) return 70;
  if (spc === "SLGT" || spc === "MRGL" || spc === "TSTM" || wrs >= 60) return 30;
  return 0;
}

/** Air quality penalty per EPA AQI category + EPA outdoor-activity guide. */
function aqPenalty(aqi: number | null): number {
  if (aqi == null || aqi <= 50) return 0;   // Good
  if (aqi <= 100) return 10;                 // Moderate
  if (aqi <= 150) return 35;                 // Unhealthy for Sensitive Groups
  if (aqi <= 200) return 60;                 // Unhealthy
  if (aqi <= 300) return 85;                 // Very Unhealthy
  return 100;                                 // Hazardous
}

/** UV penalty per WHO UV Index categories. */
function uvPenalty(uv: number | null): number {
  if (uv == null || uv < 3) return 0;   // Low
  if (uv < 6) return 10;                 // Moderate
  if (uv < 8) return 25;                 // High
  if (uv < 11) return 45;                // Very High
  return 65;                              // Extreme
}

// ── Per-activity weights (must sum to 1.0) ──────────────────────────────
interface Weights {
  heat: number;
  cold: number;
  wind: number;
  precip: number;
  storm: number;
  aq: number;
  uv: number;
}

const WEIGHTS: Record<Activity, Weights> = {
  run:  { heat: 0.30, cold: 0.15, wind: 0.10, precip: 0.20, storm: 0.15, aq: 0.05, uv: 0.05 },
  walk: { heat: 0.20, cold: 0.15, wind: 0.10, precip: 0.20, storm: 0.15, aq: 0.10, uv: 0.10 },
  bike: { heat: 0.15, cold: 0.10, wind: 0.25, precip: 0.20, storm: 0.20, aq: 0.05, uv: 0.05 },
  hike: { heat: 0.20, cold: 0.15, wind: 0.15, precip: 0.15, storm: 0.20, aq: 0.05, uv: 0.10 },
};

// ── Hard gates: active NWS alert → per-activity score cap ───────────────
interface HardGate {
  /** Regex that matches the event string (case-insensitive) */
  match: RegExp;
  label: string;
  caps: Record<Activity, number>;
}

const HARD_GATES: HardGate[] = [
  // Tornado
  { match: /tornado (warning|emergency)/i, label: "Tornado Warning",
    caps: { run: 0, walk: 0, bike: 0, hike: 0 } },
  { match: /tornado watch/i, label: "Tornado Watch",
    caps: { run: 20, walk: 25, bike: 15, hike: 10 } },
  // Severe thunderstorm
  { match: /severe thunderstorm warning/i, label: "Severe T-storm Warning",
    caps: { run: 5, walk: 10, bike: 0, hike: 0 } },
  { match: /severe thunderstorm watch/i, label: "Severe T-storm Watch",
    caps: { run: 40, walk: 45, bike: 30, hike: 25 } },
  // Flood
  { match: /flash flood warning/i, label: "Flash Flood Warning",
    caps: { run: 15, walk: 20, bike: 10, hike: 0 } },
  { match: /flood warning/i, label: "Flood Warning",
    caps: { run: 30, walk: 35, bike: 20, hike: 10 } },
  // Air quality — tier by wording. Match hazardous/unhealthy-for-all first so
  // it wins over the milder generic alert when both would apply (min-cap
  // reducer still takes the lowest, but ordering keeps the label accurate).
  { match: /air quality.*(hazardous|unhealthy(?! for sensitive))|(hazardous|unhealthy(?! for sensitive)).*air quality/i,
    label: "Air Quality — Unhealthy/Hazardous",
    caps: { run: 15, walk: 20, bike: 10, hike: 15 } },
  { match: /air quality (alert|advisory|action)/i, label: "Air Quality Alert",
    caps: { run: 40, walk: 45, bike: 35, hike: 40 } },
  // Heat
  { match: /(extreme heat|excessive heat) warning/i, label: "Extreme Heat Warning",
    caps: { run: 10, walk: 15, bike: 10, hike: 5 } },
  { match: /excessive heat watch/i, label: "Excessive Heat Watch",
    caps: { run: 55, walk: 60, bike: 55, hike: 45 } },
  { match: /heat advisory/i, label: "Heat Advisory",
    caps: { run: 40, walk: 50, bike: 45, hike: 30 } },
  // Wind
  { match: /high wind warning/i, label: "High Wind Warning",
    caps: { run: 30, walk: 40, bike: 5, hike: 15 } },
  { match: /wind advisory/i, label: "Wind Advisory",
    caps: { run: 55, walk: 60, bike: 25, hike: 40 } },
  // Winter
  { match: /(winter storm|blizzard|ice storm) warning/i, label: "Winter Storm Warning",
    caps: { run: 15, walk: 15, bike: 5, hike: 5 } },
  { match: /winter weather advisory/i, label: "Winter Weather Advisory",
    caps: { run: 45, walk: 45, bike: 20, hike: 25 } },
  // Fog
  { match: /dense fog advisory/i, label: "Dense Fog Advisory",
    caps: { run: 55, walk: 65, bike: 30, hike: 45 } },
  // Fire weather
  { match: /red flag warning|fire weather warning/i, label: "Red Flag Warning",
    caps: { run: 40, walk: 45, bike: 30, hike: 20 } },
  // Freeze
  { match: /freeze warning|frost advisory/i, label: "Freeze/Frost",
    caps: { run: 60, walk: 55, bike: 55, hike: 50 } },
  // Dust
  { match: /dust storm warning/i, label: "Dust Storm Warning",
    caps: { run: 15, walk: 20, bike: 5, hike: 10 } },
  // Lightning-focused SPC Mesoscale Discussion
  { match: /mesoscale discussion.*(lightning|thunderstorm)|lightning.*mesoscale/i,
    label: "SPC Lightning MD",
    caps: { run: 35, walk: 40, bike: 25, hike: 20 } },
  // Evacuation / shelter — everything stops.
  { match: /evacuation|shelter in place/i, label: "Evacuation Order",
    caps: { run: 0, walk: 0, bike: 0, hike: 0 } },
];

/** AQI-based hard gate (Very Unhealthy = AQI > 200). */
function aqiHardGate(aqi: number | null, activity: Activity): { cap: number; label: string } | null {
  if (aqi != null && aqi > 200) {
    const caps: Record<Activity, number> = { run: 20, walk: 20, bike: 15, hike: 20 };
    return { cap: caps[activity], label: `AQI ${Math.round(aqi)} — Very Unhealthy` };
  }
  return null;
}

// ── Per-hour scorer ─────────────────────────────────────────────────────
function scoreHour(
  h: HourlyPoint,
  aqi: number | null,
  activity: Activity,
  ctx: Pick<ComfortContext, "activeWarnings" | "spcRisk" | "fireRisk" | "wrs">,
): HourResult {
  const w = WEIGHTS[activity];

  const penalties: { label: string; raw: number; weighted: number }[] = [
    { label: "Heat",           raw: heatPenalty(h.temperature, h.humidity), weighted: 0 },
    { label: "Cold",           raw: coldPenalty(h.temperature, h.windSpeed), weighted: 0 },
    { label: "Wind",           raw: windPenalty(h.windSpeed, h.windGusts), weighted: 0 },
    { label: "Precipitation",  raw: precipPenalty(h.precipProbability, h.precipMm), weighted: 0 },
    { label: "Storm/lightning",raw: stormPenalty(ctx.activeWarnings, ctx.spcRisk, ctx.wrs), weighted: 0 },
    { label: "Air quality",    raw: aqPenalty(aqi), weighted: 0 },
    { label: "UV/sun",         raw: uvPenalty(h.uvIndex), weighted: 0 },
  ];
  const wKeys: (keyof Weights)[] = ["heat", "cold", "wind", "precip", "storm", "aq", "uv"];
  penalties.forEach((p, i) => { p.weighted = p.raw * w[wKeys[i]]; });

  const totalPenalty = penalties.reduce((s, p) => s + p.weighted, 0);
  let score = clamp(100 - totalPenalty, 0, 100);

  // Hard gates from active NWS alerts.
  let gateLabel = "";
  let gateCap = 100;
  for (const g of HARD_GATES) {
    if (ctx.activeWarnings.some((ev) => g.match.test(ev))) {
      const cap = g.caps[activity];
      if (cap < gateCap) { gateCap = cap; gateLabel = g.label; }
    }
  }
  const aqGate = aqiHardGate(aqi, activity);
  if (aqGate && aqGate.cap < gateCap) { gateCap = aqGate.cap; gateLabel = aqGate.label; }

  if (gateCap < score) score = gateCap;

  // Top limiter.
  let limiter = "None";
  if (gateCap < 100 && gateCap <= score) {
    limiter = `Alert: ${gateLabel}`;
  } else {
    const top = penalties.reduce((a, b) => (b.weighted > a.weighted ? b : a),
      { label: "None", raw: 0, weighted: 0 });
    if (top.weighted >= 3) limiter = top.label;
  }

  return { time: h.time, score: Math.round(score), tier: tierFor(score), limiter };
}

// ── Public entry ────────────────────────────────────────────────────────
export function computeComfort(
  activity: Activity,
  ctx: ComfortContext,
): ActivityResult {
  const series: HourResult[] = ctx.hourly.slice(0, 7).map((h) => {
    const idx = ctx.airQuality.findIndex((a) => a.time === h.time);
    const aq = idx >= 0 ? ctx.airQuality[idx].usAqi : (ctx.airQuality[0]?.usAqi ?? null);
    return scoreHour(h, aq, activity, ctx);
  });
  const now = series[0] ?? { time: "", score: 0, tier: "Dangerous" as const, limiter: "No data" };
  const best = series.reduce((a, b) => (b.score > a.score ? b : a), now);
  return { activity, now, best, series };
}

export function computeAllActivities(ctx: ComfortContext): ActivityResult[] {
  const activities: Activity[] = ["walk", "run", "bike", "hike"];
  return activities.map((a) => computeComfort(a, ctx));
}
