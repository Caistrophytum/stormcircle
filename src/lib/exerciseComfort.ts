/**
 * exerciseComfort — pure scoring for outdoor activity comfort. v2 model.
 *
 * v2 changes vs. v1:
 *   1. AGGREGATION: linear weighted sum → weighted power-mean (Minkowski
 *      norm with p≈2.5). The worst hazard organically dominates, no
 *      dependency on region-specific NWS gates for severity to "win."
 *   2. PENALTY CURVES: discrete tiers → continuous logistic curves for
 *      physically continuous hazards (heat, cold, wind, precip rate, AQI).
 *      Storm/lightning and UV stay tiered — they're genuinely categorical
 *      (warnings) or already conservatively banded (WHO UV).
 *   3. HARD GATES: trimmed to truly binary/life-safety events only
 *      (tornado, evacuation). Everything else's severity now comes from
 *      the smoothed penalty + power-mean.
 */

import type { SPCRiskLevel } from "@/hooks/useHomeCityRisk";
import type { FireRiskLevel } from "@/hooks/useHomeCityFireRisk";

export type Activity = "walk" | "run" | "bike" | "hike";

export type ComfortTier = "Ideal" | "Good" | "Fair" | "Poor" | "Dangerous";

export interface HourlyPoint {
  /** UTC ISO timestamp for the hour */
  time: string;
  /** °C */
  temperature: number | null;
  /** °C — Open-Meteo apparent temperature (unused by v2, kept for compat) */
  apparentTemperature: number | null;
  /** % */
  humidity: number | null;
  /** 0..100 */
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
  usAqi: number | null;
}

export interface ComfortContext {
  hourly: HourlyPoint[];       // 7 hours: index 0 = current, 1..6 next 6
  airQuality: AQPoint[];       // aligned by time (best effort)
  activeWarnings: string[];    // NWS event names covering the home point
  spcRisk: SPCRiskLevel;
  fireRisk: FireRiskLevel;
  wrs: number;                 // 0–100 WRS threat from sounding panel
}

export interface HourResult {
  time: string;
  score: number;               // 0..100
  tier: ComfortTier;
  limiter: string;             // human-readable top limiting factor
}

export interface ActivityResult {
  activity: Activity;
  now: HourResult;
  best: HourResult;
  series: HourResult[];
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

// ── Shared logistic helper ──────────────────────────────────────────────
// Smooth 0–100 penalty. Rises around `midpoint`; `k` controls steepness.
// `invert=true` for hazards where LOWER raw value = MORE danger (cold).
function logisticPenalty(value: number, midpoint: number, k: number, invert = false): number {
  const x = invert ? midpoint - value : value - midpoint;
  return 100 / (1 + Math.exp(-k * x));
}

// ── Penalty functions ───────────────────────────────────────────────────

/**
 * Heat — WBGT (BoM outdoor approximation).
 *   e = (RH/100) * 6.112 * exp(17.62T / (243.12+T))         [Tetens, hPa]
 *   WBGT ≈ 0.567T + 0.393e + 3.94
 * Logistic midpoint 27°C ≈ ACSM moderate-risk boundary; saturates ~34–35°C.
 * apparentTemperature intentionally NOT fed in — e already encodes humidity.
 */
function heatPenalty(tempC: number | null, rh: number | null): number {
  if (tempC == null || rh == null) return 0;
  const es = 6.112 * Math.exp((17.62 * tempC) / (243.12 + tempC));
  const e = es * (clamp(rh, 0, 100) / 100);
  const wbgt = 0.567 * tempC + 0.393 * e + 3.94;
  return logisticPenalty(wbgt, 27, 0.35);
}

/**
 * Cold — NWS 2001 wind chill; only valid T ≤ 50°F & V ≥ 3mph.
 * Logistic midpoint −10°F ≈ NWS "frostbite in 30min"; invert (colder=worse).
 */
function coldPenalty(tempC: number | null, windMs: number | null): number {
  if (tempC == null) return 0;
  const tF = tempC * 9 / 5 + 32;
  const vMph = (windMs ?? 0) * 2.23694;
  if (tF > 50 || vMph < 3) return 0;
  const v16 = Math.pow(vMph, 0.16);
  const wct = 35.74 + 0.6215 * tF - 35.75 * v16 + 0.4275 * tF * v16;
  return logisticPenalty(wct, -10, 0.09, true);
}

/**
 * Wind — max(sustained, gust) in km/h.
 * Logistic midpoint ~62 km/h (Beaufort 8, gale); steep — wind is fairly binary.
 */
function windPenalty(sustainedMs: number | null, gustsMs: number | null): number {
  const s = sustainedMs ?? 0;
  const g = gustsMs ?? s;
  const kmh = Math.max(s, g) * 3.6;
  return logisticPenalty(kmh, 62, 0.09);
}

/**
 * Precip — smoothed rate axis (midpoint ~7.5 mm/h, WMO moderate/heavy),
 * scaled linearly by probability as a confidence discount (floor 0.4).
 */
function precipPenalty(prob: number | null, mm: number | null): number {
  const rate = mm ?? 0;
  if (rate <= 0) return 0;
  const p = prob == null ? 1 : clamp(prob / 100, 0, 1);
  const rateSeverity = logisticPenalty(rate, 7.5, 0.5);
  return rateSeverity * (0.4 + 0.6 * p);
}

/**
 * Storm/lightning — tiered on purpose. Warnings & SPC categories are
 * discrete regimes, not continuous severity.
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
  ) return 100;              // extreme
  if (
    /thunderstorm|flash flood warning/.test(warnStr) ||
    spc === "ENH"
  ) return 70;               // warn
  if (spc === "SLGT") return 45;                                // enh
  if (spc === "MRGL" || spc === "TSTM" || wrs >= 60) return 30; // watch
  return 0;
}

/**
 * Air quality — logistic midpoint 150 (EPA "Unhealthy" boundary).
 */
function aqPenalty(aqi: number | null): number {
  if (aqi == null) return 0;
  return logisticPenalty(aqi, 150, 0.035);
}

/**
 * UV — tiered per WHO. Kept discrete: bands are already conservative and
 * UV shouldn't single-handedly dominate a score.
 */
function uvPenalty(uv: number | null): number {
  if (uv == null || uv < 3) return 0;
  if (uv < 6) return 10;
  if (uv < 8) return 25;
  if (uv < 11) return 45;
  return 65;
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

const LABELS: Record<keyof Weights, string> = {
  heat: "Heat",
  cold: "Cold",
  wind: "Wind",
  precip: "Precipitation",
  storm: "Storm/lightning",
  aq: "Air quality",
  uv: "UV/sun",
};

// ── Aggregation: weighted power-mean (Minkowski) ────────────────────────
// p=1 reproduces the old linear model; p≈2.5 lets the worst hazard
// organically dominate. limiter = highest weight×penalty contribution.
const POWER = 2.5;

function aggregate(
  penalties: Record<keyof Weights, number>,
  weights: Weights,
): { score: number; limiter: keyof Weights; topWeighted: number } {
  let sumPow = 0;
  let limiter: keyof Weights = "heat";
  let maxWeighted = -Infinity;
  (Object.keys(penalties) as (keyof Weights)[]).forEach((k) => {
    const pen = penalties[k];
    const w = weights[k];
    sumPow += w * Math.pow(pen, POWER);
    const contribution = w * pen;
    if (contribution > maxWeighted) {
      maxWeighted = contribution;
      limiter = k;
    }
  });
  const combined = Math.pow(sumPow, 1 / POWER);
  const score = clamp(100 - combined, 0, 100);
  return { score, limiter, topWeighted: maxWeighted };
}

// ── Hard gates (trimmed) ────────────────────────────────────────────────
// Only truly binary/life-safety events remain as caps.
function hardGate(activeWarnings: string[]): { cap: number; label: string } | null {
  const evac = activeWarnings.find((e) => /evacuation|shelter in place/i.test(e));
  if (evac) return { cap: 0, label: `Alert: ${evac}` };
  const tor = activeWarnings.find((e) => /tornado (warning|emergency)/i.test(e));
  if (tor) return { cap: 0, label: `Alert: ${tor}` };
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

  const penalties: Record<keyof Weights, number> = {
    heat: heatPenalty(h.temperature, h.humidity),
    cold: coldPenalty(h.temperature, h.windSpeed),
    wind: windPenalty(h.windSpeed, h.windGusts),
    precip: precipPenalty(h.precipProbability, h.precipMm),
    storm: stormPenalty(ctx.activeWarnings, ctx.spcRisk, ctx.wrs),
    aq: aqPenalty(aqi),
    uv: uvPenalty(h.uvIndex),
  };

  const { score: rawScore, limiter, topWeighted } = aggregate(penalties, w);

  let score = rawScore;
  let limiterLabel = topWeighted >= 3 ? LABELS[limiter] : "None";

  const gate = hardGate(ctx.activeWarnings);
  if (gate && gate.cap < score) {
    score = gate.cap;
    limiterLabel = gate.label;
  }

  return { time: h.time, score: Math.round(score), tier: tierFor(score), limiter: limiterLabel };
}

// ── Public entry ────────────────────────────────────────────────────────
function computeComfort(activity: Activity, ctx: ComfortContext): ActivityResult {
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
