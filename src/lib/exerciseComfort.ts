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

/**
 * A warning covering the home point. Accepts a bare event name (legacy) or an
 * object carrying the issuing severity — IMS colour tiers map onto the same
 * Moderate / Severe / Extreme scale NWS uses, so both feeds score identically.
 */
export type ActiveWarning = string | { event: string; severity?: string | null };

export interface ComfortContext {
  hourly: HourlyPoint[];       // 7 hours: index 0 = current, 1..6 next 6
  airQuality: AQPoint[];       // aligned by time (best effort)
  activeWarnings: ActiveWarning[]; // NWS/IMS events covering the home point
  spcRisk: SPCRiskLevel;
  fireRisk: FireRiskLevel;
  wrs: number;                 // 0–100 WRS threat from sounding panel
}

/** Per-factor breakdown of a single hour's score (drives the UI drill-down). */
export interface ComfortFactor {
  key: string;                 // "heat" | "cold" | ...
  label: string;               // "Heat"
  penalty: number;             // 0..100 raw hazard penalty
  weight: number;              // activity weight (0..1)
  weighted: number;            // weight × penalty
  share: number;               // % of total weighted penalty (0..100)
}

export interface HourResult {
  time: string;
  score: number;               // 0..100
  tier: ComfortTier;
  limiter: string;             // human-readable top limiting factor
  factors: ComfortFactor[];    // sorted, highest contribution first
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
 * Thermal comfort — both heat and cold are scored from the same real-feel
 * (apparent temperature) curve. 15°C real feel is the centre of the
 * comfortable range, so the penalty is 0 there.
 *   • Above 15°C → heat penalty rises as it gets hotter (midpoint 28°C).
 *   • Below 15°C → cold penalty rises as it gets colder (midpoint 5°C).
 * Apparent temperature already folds in humidity and wind, so no extra inputs.
 */
function heatPenalty(apparentTempC: number | null): number {
  if (apparentTempC == null || apparentTempC <= 15) return 0;
  return logisticPenalty(apparentTempC, 28, 0.3);
}

function coldPenalty(apparentTempC: number | null): number {
  if (apparentTempC == null || apparentTempC >= 15) return 0;
  return logisticPenalty(apparentTempC, 5, 0.3, true);
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

// ── Warning normalisation (NWS + IMS) ───────────────────────────────────
/** 1 = advisory/moderate, 2 = severe, 3 = extreme. */
const SEV_RANK: Record<string, number> = {
  minor: 1,
  moderate: 1,
  severe: 2,
  extreme: 3,
};

interface NormWarning {
  event: string;
  /** 1..3 */
  sev: number;
}

function normalizeWarnings(list: ActiveWarning[]): NormWarning[] {
  return list.map((w) => {
    const event = typeof w === "string" ? w : w.event;
    const raw = typeof w === "string" ? null : w.severity;
    const fromFeed = raw ? SEV_RANK[raw.toLowerCase()] : undefined;
    // No feed severity (legacy string): infer from the product wording.
    const inferred = /emergency/i.test(event) ? 3 : /warning/i.test(event) ? 2 : 1;
    return { event, sev: fromFeed ?? inferred };
  });
}

function warningText(list: NormWarning[]): string {
  return list.map((w) => w.event).join(" | ").toLowerCase();
}

/**
 * Category floors — a warning covering the home point forces its matching
 * hazard category to at least this penalty, regardless of what the raw model
 * data says. Works for any feed: NWS product names and IMS titles
 * ("Heat Stress Warning", "Extreme Temperatures Warning", …) both match here,
 * and the floor scales with the issuing severity (IMS colour tier).
 */
const WARNING_CATEGORIES: { re: RegExp; key: keyof Weights }[] = [
  { re: /heat|hot weather|high temperature|extreme temperature|sharav|warm/i, key: "heat" },
  { re: /cold|freeze|frost|wind chill|snow|ice|blizzard|winter/i, key: "cold" },
  { re: /wind|gale|gust|storm force|squall/i, key: "wind" },
  { re: /flood|rain|shower|hail/i, key: "precip" },
  { re: /thunder|lightning|tornado/i, key: "storm" },
  { re: /dust|air quality|smoke|haze|sandstorm/i, key: "aq" },
];

/** Floor applied per severity rank. */
const SEV_FLOOR: Record<number, number> = { 1: 45, 2: 70, 3: 90 };

function warningFloors(list: NormWarning[]): Partial<Record<keyof Weights, number>> {
  const out: Partial<Record<keyof Weights, number>> = {};
  for (const w of list) {
    for (const c of WARNING_CATEGORIES) {
      if (!c.re.test(w.event)) continue;
      const floor = SEV_FLOOR[w.sev] ?? 45;
      if ((out[c.key] ?? 0) < floor) out[c.key] = floor;
    }
  }
  return out;
}

/**
 * Storm/lightning — tiered on purpose. Warnings & SPC categories are
 * discrete regimes, not continuous severity.
 */
function stormPenalty(
  warnings: NormWarning[],
  spc: SPCRiskLevel,
  wrs: number,
): number {
  const warnStr = warningText(warnings);
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
 * UV — continuous piecewise-linear curve through the user's prescribed
 * index-to-penalty mapping.
 *
 * Mapping: 0→0, 1→5, 2→10, 3→15, 4→20, 5→30, 6→45, 7→65, 8→95, 9+→100.
 */
const UV_ANCHORS: [number, number][] = [
  [0, 0], [1, 5], [2, 10], [3, 15], [4, 20], [5, 30], [6, 45], [7, 65], [8, 95], [9, 100],
];

function uvPenalty(uv: number | null): number {
  if (uv == null || uv <= 0) return 0;
  if (uv >= 9) return 100;
  for (let i = 0; i < UV_ANCHORS.length - 1; i++) {
    const [x0, y0] = UV_ANCHORS[i];
    const [x1, y1] = UV_ANCHORS[i + 1];
    if (uv <= x1) return y0 + ((uv - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 100;
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
// p=1 reproduces the old linear model; p=3.5 lets the worst hazard
// very strongly dominate. limiter = highest weight×penalty contribution.
const POWER = 3.5;

// Severity-scaled weighting: while a factor sits in its "normal" band
// (penalty ≤ ESCALATION_START) it keeps its baseline activity weight. Past
// that point its weight grows toward 1.0, so a single extreme condition
// (e.g. Antarctic cold) can dominate the score instead of being diluted by
// the other, benign factors.
const ESCALATION_START = 45;
const ESCALATION_CURVE = 1.6;

function effectiveWeight(base: number, penalty: number): number {
  if (penalty <= ESCALATION_START) return base;
  const t = clamp((penalty - ESCALATION_START) / (100 - ESCALATION_START), 0, 1);
  return base + (1 - base) * Math.pow(t, ESCALATION_CURVE);
}

function aggregate(
  penalties: Record<keyof Weights, number>,
  weights: Weights,
): {
  score: number;
  limiters: (keyof Weights)[];
  topWeighted: number;
  contributions: { key: keyof Weights; weighted: number; weight: number }[];
} {
  const keys = Object.keys(penalties) as (keyof Weights)[];
  const eff: Record<string, number> = {};
  keys.forEach((k) => {
    eff[k] = effectiveWeight(weights[k], penalties[k]);
  });
  // Keep the aggregate a true weighted mean: only normalize when escalation
  // has pushed the total above 1 (never scale weights up).
  const sumW = keys.reduce((s, k) => s + eff[k], 0);
  const norm = sumW > 1 ? sumW : 1;

  let sumPow = 0;
  const contributions: { key: keyof Weights; weighted: number; weight: number }[] = [];
  keys.forEach((k) => {
    const pen = penalties[k];
    const w = eff[k] / norm;
    sumPow += w * Math.pow(pen, POWER);
    contributions.push({ key: k, weighted: w * pen, weight: w });
  });
  contributions.sort((a, b) => b.weighted - a.weighted);
  const topWeighted = contributions[0]?.weighted ?? 0;
  // Any factor within 40% of the top contribution AND meaningfully large
  // is treated as a co-primary limiter, so multiple concurrent hazards
  // (e.g. heat + wind) surface together instead of one masking the rest.
  const cutoff = Math.max(3, topWeighted * 0.6);
  const limiters = contributions
    .filter((c) => c.weighted >= cutoff)
    .map((c) => c.key);
  const combined = Math.pow(sumPow, 1 / POWER);
  const score = clamp(100 - combined, 0, 100);
  return { score, limiters, topWeighted, contributions };
}



// ── Hard gates (trimmed) ────────────────────────────────────────────────
// Only truly binary/life-safety events remain as caps. Extreme-severity
// warnings from any feed (NWS "Extreme", IMS red tier) also cap the score.
function hardGate(warnings: NormWarning[]): { cap: number; label: string } | null {
  const evac = warnings.find((w) => /evacuation|shelter in place/i.test(w.event));
  if (evac) return { cap: 0, label: `Alert: ${evac.event}` };
  const tor = warnings.find((w) => /tornado (warning|emergency)/i.test(w.event));
  if (tor) return { cap: 0, label: `Alert: ${tor.event}` };
  const extreme = warnings.find((w) => w.sev >= 3);
  if (extreme) return { cap: 15, label: `Alert: ${extreme.event}` };
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
  const warnings = normalizeWarnings(ctx.activeWarnings);

  const penalties: Record<keyof Weights, number> = {
    heat: heatPenalty(h.apparentTemperature),
    cold: coldPenalty(h.apparentTemperature),
    wind: windPenalty(h.windSpeed, h.windGusts),
    precip: precipPenalty(h.precipProbability, h.precipMm),
    storm: stormPenalty(warnings, ctx.spcRisk, ctx.wrs),
    aq: aqPenalty(aqi),
    uv: uvPenalty(h.uvIndex),
  };

  // Any active warning lifts its hazard category to a severity-scaled floor.
  const floors = warningFloors(warnings);
  (Object.keys(floors) as (keyof Weights)[]).forEach((k) => {
    penalties[k] = Math.max(penalties[k], floors[k] ?? 0);
  });

  const { score: rawScore, limiters, topWeighted, contributions } = aggregate(penalties, w);

  let score = rawScore;
  let limiterLabel =
    topWeighted >= 3 && limiters.length > 0
      ? limiters.map((k) => LABELS[k]).join(" + ")
      : "None";

  const gate = hardGate(warnings);
  if (gate && gate.cap < score) {
    score = gate.cap;
    limiterLabel = gate.label;
  }

  // Breakdown for the UI drill-down: share of the total weighted penalty.
  const totalWeighted = contributions.reduce((s, c) => s + c.weighted, 0);
  const factors: ComfortFactor[] = contributions.map((c) => ({
    key: c.key,
    label: LABELS[c.key],
    penalty: Math.round(penalties[c.key]),
    weight: w[c.key],
    weighted: c.weighted,
    share: totalWeighted > 0 ? (c.weighted / totalWeighted) * 100 : 0,
  }));

  return {
    time: h.time,
    score: Math.round(score),
    tier: tierFor(score),
    limiter: limiterLabel,
    factors,
  };
}

// ── Public entry ────────────────────────────────────────────────────────
function computeComfort(activity: Activity, ctx: ComfortContext): ActivityResult {
  const series: HourResult[] = ctx.hourly.slice(0, 7).map((h) => {
    const idx = ctx.airQuality.findIndex((a) => a.time === h.time);
    const aq = idx >= 0 ? ctx.airQuality[idx].usAqi : (ctx.airQuality[0]?.usAqi ?? null);
    return scoreHour(h, aq, activity, ctx);
  });
  const now: HourResult = series[0] ?? {
    time: "",
    score: 0,
    tier: "Dangerous",
    limiter: "No data",
    factors: [],
  };

  const best = series.reduce((a, b) => (b.score > a.score ? b : a), now);
  return { activity, now, best, series };
}

export function computeAllActivities(ctx: ComfortContext): ActivityResult[] {
  const activities: Activity[] = ["walk", "run", "bike", "hike"];
  return activities.map((a) => computeComfort(a, ctx));
}

// ── Warning → restriction explainer (UI) ────────────────────────────────
// Mirrors exactly what `scoreHour` applies, but translates the math into
// plain language so users understand why an alert changes their score.
export interface WarningRestriction {
  event: string;
  /** "Moderate" | "Severe" | "Extreme" — normalised severity label. */
  severityLabel: string;
  /** Plain-language effects, e.g. "Heat is counted as a major hazard". */
  effects: string[];
}

const SEV_LABEL: Record<number, string> = { 1: "Moderate", 2: "Severe", 3: "Extreme" };

/** Convert a numeric floor into a qualitative hazard level. */
function floorLabel(v: number): string {
  if (v >= 90) return "major hazard";
  if (v >= 70) return "significant hazard";
  if (v >= 45) return "moderate hazard";
  return "elevated hazard";
}

export function describeWarningRestrictions(list: ActiveWarning[]): WarningRestriction[] {
  return normalizeWarnings(list).map((w) => {
    const effects: string[] = [];

    // Hard gates first — they override everything else.
    if (/evacuation|shelter in place|tornado (warning|emergency)/i.test(w.event)) {
      effects.push("Outdoor exercise is not recommended — this alert overrides the score.");
      return { event: w.event, severityLabel: "Extreme", effects };
    }

    if (w.sev >= 3) {
      effects.push("Maximum possible comfort score is 15/100 — exercise is dangerous right now.");
    }

    // Category floors — explain what gets bumped up and why.
    const floor = SEV_FLOOR[w.sev] ?? 45;
    const matched = WARNING_CATEGORIES.filter((c) => c.re.test(w.event));
    if (matched.length) {
      const categories = matched.map((c) => LABELS[c.key].toLowerCase());
      const list = categories.join(" + ");
      const level = floorLabel(floor);
      effects.push(
        `This alert treats ${list} as at least a ${level} (${floor}/100), ` +
          `so the matching part of the score cannot stay high even if the weather reading itself looks mild.`,
      );
    }

    if (!effects.length) effects.push("Advisory only — no automatic score restriction.");
    return { event: w.event, severityLabel: SEV_LABEL[w.sev] ?? "Moderate", effects };
  });
}

