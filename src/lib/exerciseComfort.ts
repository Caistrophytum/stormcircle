/**
 * exerciseComfort — pure scoring for outdoor activity comfort. v3 model.
 *
 * v3 is a transparent ADDITIVE model:
 *   score = 100 − Σ hazard points   (clamped 0..100)
 *
 * Each hazard maps its raw value linearly onto 0..100 severity, is scaled by
 * a per-hazard maximum point budget, and then by a per-activity multiplier:
 *
 *   Hazard   Range                        Max points   run    walk   bike   hike
 *   Temp     coldest ← comfort → hottest      100      ×1.5   ×1.25  ×1.0   ×1.25
 *   Wind     0 – 110 km/h                     100      ×1.0   ×1.25  ×1.25  ×1.5
 *   UV       0 – 11                            60      ×1.0   ×1.25  ×1.25  ×1.5
 *   AQI      Good – Hazardous                 100      ×1.25  ×1.5   ×1.25  ×1.0
 *   Rain     0 – 20 mm/h                       80      ×1.25  ×1.25  ×1.0   ×1.5
 *
 * Active warnings (NWS / IMS) raise the severity floor of the hazard they
 * cover; life-safety products (tornado, evacuation) still hard-cap the score.
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
  /** °C — Open-Meteo apparent temperature ("real feel") */
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

export type HazardKey = "temp" | "wind" | "uv" | "aq" | "rain";

/** Per-hazard breakdown of a single hour's score (drives the UI drill-down). */
export interface ComfortFactor {
  key: HazardKey;
  label: string;
  /** 0..100 raw severity of the hazard */
  penalty: number;
  /** Activity multiplier applied to the hazard's point budget */
  weight: number;
  /** Points actually deducted from 100 */
  points: number;
  /** Maximum points this hazard could deduct for this activity */
  maxPoints: number;
  /** Alias kept for older UI code — same as `points` */
  weighted: number;
  /** % of the total deducted points */
  share: number;
  /** Human-readable current reading, e.g. "32 °C real feel" */
  detail: string;
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

/** Linear 0..100 severity between `lo` (0) and `hi` (100). */
function ramp(v: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
}

// ── Hazard severity curves (temp, wind, UV, rain logarithmic; AQI linear) ──

/** Comfortable real-feel band — 0 severity inside it. */
const COMFORT_LO = 12;   // °C
const COMFORT_HI = 24;   // °C
const COLD_EXTREME = -25; // °C → 100
const HEAT_EXTREME = 45;  // °C → 100

/** Logarithmic distance-from-extreme curve. Stays gentle near the comfort
 *  boundary and accelerates as it approaches the extreme. */
function logRamp(distanceFromExtreme: number, span: number, k = 2): number {
  if (span <= 0) return 0;
  const d = clamp(distanceFromExtreme, 0, span);
  return 100 * (1 - Math.log(1 + k * d) / Math.log(1 + k * span));
}

/** Temperature — real feel; 100 at the coldest end, 0 in comfort, 100 hottest.
 *  Uses a log curve so 30 °C is treated much more gently than 35 °C. */
function tempSeverity(realFeelC: number | null): number {
  if (realFeelC == null) return 0;
  if (realFeelC >= COMFORT_LO && realFeelC <= COMFORT_HI) return 0;
  if (realFeelC < COMFORT_LO) {
    return logRamp(realFeelC - COLD_EXTREME, COMFORT_LO - COLD_EXTREME);
  }
  return logRamp(HEAT_EXTREME - realFeelC, HEAT_EXTREME - COMFORT_HI);
}

/** Wind — max(sustained, gust), 0–110 km/h, logarithmic (gentle at low speeds,
 *  steep near the 110 km/h extreme). */
function windSeverity(sustainedMs: number | null, gustsMs: number | null): number {
  const s = sustainedMs ?? 0;
  const g = gustsMs ?? s;
  const kph = clamp(Math.max(s, g) * 3.6, 0, 110);
  return logRamp(110 - kph, 110);
}

/** UV — index 0–11, logarithmic (budget caps it at 60 points). */
function uvSeverity(uv: number | null): number {
  if (uv == null) return 0;
  return logRamp(11 - clamp(uv, 0, 11), 11);
}

/** Air quality — US AQI Good (50) → Hazardous (300+) → 0–100 severity. */
function aqSeverity(aqi: number | null): number {
  if (aqi == null) return 0;
  return ramp(aqi, 50, 300);
}

/** Rain — 0–20 mm/h, logarithmic. */
function rainSeverity(mm: number | null): number {
  const v = clamp(mm ?? 0, 0, 20);
  return logRamp(20 - v, 20);
}


// ── Hazard budgets and per-activity multipliers ─────────────────────────
const MAX_POINTS: Record<HazardKey, number> = {
  temp: 100,
  wind: 100,
  uv: 60,
  aq: 100,
  rain: 80,
};

const MULTIPLIERS: Record<Activity, Record<HazardKey, number>> = {
  run:  { temp: 1.5,  wind: 1.0,  uv: 1.0,  aq: 1.25, rain: 1.25 },
  walk: { temp: 1.25, wind: 1.25, uv: 1.25, aq: 1.5,  rain: 1.25 },
  bike: { temp: 1.0,  wind: 1.25, uv: 1.25, aq: 1.25, rain: 1.0 },
  hike: { temp: 1.25, wind: 1.5,  uv: 1.5,  aq: 1.0,  rain: 1.5 },
};

const LABELS: Record<HazardKey, string> = {
  temp: "Temperature",
  wind: "Wind",
  uv: "UV/sun",
  aq: "Air quality",
  rain: "Rain",
};

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

/**
 * Category floors — a warning covering the home point forces its matching
 * hazard to at least this severity, regardless of the raw model data.
 */
const WARNING_CATEGORIES: { re: RegExp; key: HazardKey }[] = [
  { re: /heat|hot weather|high temperature|extreme temperature|sharav|warm/i, key: "temp" },
  { re: /cold|freeze|frost|wind chill|snow|ice|blizzard|winter/i, key: "temp" },
  { re: /wind|gale|gust|storm force|squall/i, key: "wind" },
  { re: /flood|rain|shower|hail|thunder|lightning/i, key: "rain" },
  { re: /dust|air quality|smoke|haze|sandstorm/i, key: "aq" },
];

/** Severity floor applied per warning rank. */
const SEV_FLOOR: Record<number, number> = { 1: 45, 2: 70, 3: 90 };

function warningFloors(list: NormWarning[]): Partial<Record<HazardKey, number>> {
  const out: Partial<Record<HazardKey, number>> = {};
  for (const w of list) {
    for (const c of WARNING_CATEGORIES) {
      if (!c.re.test(w.event)) continue;
      const floor = SEV_FLOOR[w.sev] ?? 45;
      if ((out[c.key] ?? 0) < floor) out[c.key] = floor;
    }
  }
  return out;
}

// ── Hard gates ──────────────────────────────────────────────────────────
// Only truly binary/life-safety events cap the score outright.
function hardGate(warnings: NormWarning[]): { cap: number; label: string } | null {
  const evac = warnings.find((w) => /evacuation|shelter in place/i.test(w.event));
  if (evac) return { cap: 0, label: `Alert: ${evac.event}` };
  const tor = warnings.find((w) => /tornado (warning|emergency)/i.test(w.event));
  if (tor) return { cap: 0, label: `Alert: ${tor.event}` };
  const extreme = warnings.find((w) => w.sev >= 3);
  if (extreme) return { cap: 15, label: `Alert: ${extreme.event}` };
  return null;
}

// ── Readable current-value strings for the UI ───────────────────────────
function details(h: HourlyPoint, aqi: number | null): Record<HazardKey, string> {
  const rf = h.apparentTemperature;
  const wind = Math.max(h.windSpeed ?? 0, h.windGusts ?? h.windSpeed ?? 0) * 3.6;
  return {
    temp: rf == null ? "no data" : `${Math.round(rf)} °C real feel`,
    wind: `${Math.round(wind)} km/h`,
    uv: h.uvIndex == null ? "no data" : `UV ${h.uvIndex.toFixed(1)}`,
    aq: aqi == null ? "no data" : `AQI ${Math.round(aqi)}`,
    rain: `${(h.precipMm ?? 0).toFixed(1)} mm/h`,
  };
}

// ── Per-hour scorer ─────────────────────────────────────────────────────
function scoreHour(
  h: HourlyPoint,
  aqi: number | null,
  activity: Activity,
  ctx: Pick<ComfortContext, "activeWarnings">,
): HourResult {
  const mult = MULTIPLIERS[activity];
  const warnings = normalizeWarnings(ctx?.activeWarnings ?? []);

  const severity: Record<HazardKey, number> = {
    temp: tempSeverity(h.apparentTemperature),
    wind: windSeverity(h.windSpeed, h.windGusts),
    uv: uvSeverity(h.uvIndex),
    aq: aqSeverity(aqi),
    rain: rainSeverity(h.precipMm),
  };

  // Active warnings lift their hazard to a severity floor.
  const floors = warningFloors(warnings);
  (Object.keys(floors) as HazardKey[]).forEach((k) => {
    severity[k] = Math.max(severity[k], floors[k] ?? 0);
  });

  const text = details(h, aqi);
  const keys: HazardKey[] = ["temp", "wind", "uv", "aq", "rain"];

  const raw = keys.map((k) => {
    const maxPoints = MAX_POINTS[k] * mult[k];
    return {
      key: k,
      severity: severity[k],
      maxPoints,
      points: (severity[k] / 100) * maxPoints,
      weight: mult[k],
      detail: text[k],
    };
  });

  const totalPoints = raw.reduce((s, f) => s + f.points, 0);
  let score = clamp(100 - totalPoints, 0, 100);

  const factors: ComfortFactor[] = raw
    .map((f) => ({
      key: f.key,
      label: LABELS[f.key],
      penalty: Math.round(f.severity),
      weight: f.weight,
      points: Math.round(f.points * 10) / 10,
      maxPoints: Math.round(f.maxPoints),
      weighted: f.points,
      share: totalPoints > 0 ? (f.points / totalPoints) * 100 : 0,
      detail: f.detail,
    }))
    .sort((a, b) => b.points - a.points);

  const top = factors.filter((f) => f.points >= Math.max(3, factors[0].points * 0.6));
  let limiterLabel = factors[0]?.points >= 3 ? top.map((f) => f.label).join(" + ") : "None";

  const gate = hardGate(warnings);
  if (gate && gate.cap < score) {
    score = gate.cap;
    limiterLabel = gate.label;
  }

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
export interface WarningRestriction {
  event: string;
  /** "Moderate" | "Severe" | "Extreme" — normalised severity label. */
  severityLabel: string;
  /** Plain-language effects, e.g. "Wind is counted as a major hazard". */
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

    const floor = SEV_FLOOR[w.sev] ?? 45;
    const matched = WARNING_CATEGORIES.filter((c) => c.re.test(w.event));
    if (matched.length) {
      const categories = Array.from(new Set(matched.map((c) => LABELS[c.key].toLowerCase())));
      effects.push(
        `This alert treats ${categories.join(" + ")} as at least a ${floorLabel(floor)} ` +
          `(${floor}/100), so that hazard keeps deducting points even if the reading looks mild.`,
      );
    }

    if (!effects.length) effects.push("Advisory only — no automatic score restriction.");
    return { event: w.event, severityLabel: SEV_LABEL[w.sev] ?? "Moderate", effects };
  });
}
