/**
 * exerciseComfort — pure scoring for outdoor activity comfort.
 *
 * Combines "now + next 6 h" weather (Open-Meteo hourly), US AQI (Open-Meteo
 * air-quality), active NWS warnings that cover the user's home point, and the
 * outlook layer (SPC categorical, SPC Fire Weather, and the app's own WRS
 * threat number) into a 0–100 score per activity plus the top limiting factor.
 *
 * Design notes:
 *   • Score composition is *subtractive from 100* so we can trivially surface
 *     the biggest single penalty as the "limiter" for the UI.
 *   • Activity-specific weight vectors let a strong headwind hammer a bike run
 *     while barely nudging a walk; UV punishes long-exposure activities more
 *     than a brisk bike commute; heat index dominates run/hike; etc.
 *   • Active NWS Warning/Emergency polygons that contain the home point are a
 *     HARD downgrade to ≤ 15 ("Dangerous") — no matter how nice the sky looks
 *     you don't run through a Tornado Warning.
 *   • Outlooks (SPC / Fire / WRS) are SOFT downgrades — they nudge the score
 *     lower but don't force Dangerous.
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
export function tierFor(score: number): ComfortTier {
  if (score >= 80) return "Ideal";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "Poor";
  return "Dangerous";
}

// ── Activity-specific weight vectors ────────────────────────────────────
// Each entry is the *maximum penalty* that factor can subtract from 100.
// Tuned so that a single dominant hazard can drop you into Poor, and two
// stacked hazards into Dangerous, without going negative in typical weather.
interface Weights {
  heat: number;      // apparent temp > 27°C
  cold: number;      // apparent temp < 5°C
  wind: number;      // gusts
  precip: number;    // rain prob × intensity
  uv: number;        // uv index
  aq: number;        // US AQI
  humidity: number;  // for hot & humid double-penalty
}

const WEIGHTS: Record<Activity, Weights> = {
  walk: { heat: 30, cold: 20, wind: 10, precip: 20, uv: 15, aq: 25, humidity: 10 },
  run:  { heat: 45, cold: 25, wind: 15, precip: 25, uv: 25, aq: 40, humidity: 20 },
  bike: { heat: 30, cold: 35, wind: 45, precip: 35, uv: 20, aq: 35, humidity: 10 },
  hike: { heat: 40, cold: 30, wind: 20, precip: 30, uv: 30, aq: 30, humidity: 15 },
};

// ── Individual factor scorers ───────────────────────────────────────────
// Each returns a 0..1 severity, multiplied by the activity weight to get the
// actual point penalty.
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function heatSeverity(appC: number | null): number {
  if (appC == null) return 0;
  // 27 °C comfortable → 42 °C ≈ dangerous.
  return clamp01((appC - 27) / (42 - 27));
}
function coldSeverity(appC: number | null): number {
  if (appC == null) return 0;
  // 5 °C fine → −20 °C dangerous.
  return clamp01((5 - appC) / (5 - -20));
}
function windSeverity(gustsMs: number | null): number {
  if (gustsMs == null) return 0;
  // 5 m/s pleasant → 20 m/s (~45 mph) dangerous.
  return clamp01((gustsMs - 5) / (20 - 5));
}
function precipSeverity(prob: number | null, mm: number | null): number {
  const p = prob == null ? 0 : clamp01(prob / 100);
  const i = mm == null ? 0 : clamp01(mm / 5); // 5 mm/h heavy
  // combine — probability weighted, intensity boosts.
  return clamp01(0.6 * p + 0.6 * i);
}
function uvSeverity(uv: number | null): number {
  if (uv == null) return 0;
  // UV 3 fine → UV 11+ extreme.
  return clamp01((uv - 3) / (11 - 3));
}
function aqSeverity(aqi: number | null): number {
  if (aqi == null) return 0;
  // 50 (Good→Moderate) start → 200 (Very Unhealthy) full.
  return clamp01((aqi - 50) / (200 - 50));
}
function humiditySeverity(rh: number | null, appC: number | null): number {
  if (rh == null || appC == null) return 0;
  // Only counts when it's warm — humid+cold is comfortable enough.
  if (appC < 22) return 0;
  return clamp01((rh - 60) / (100 - 60));
}

// ── Outlook / warning penalties (activity-agnostic) ─────────────────────
const SPC_PENALTY: Record<SPCRiskLevel, number> = {
  NONE: 0, TSTM: 3, MRGL: 8, SLGT: 18, ENH: 30, MDT: 50, HIGH: 70,
};
const FIRE_PENALTY: Record<FireRiskLevel, number> = {
  NONE: 0, ELEV: 8, CRIT: 30, EXTM: 55,
};

/** Keywords in an active alert event that make outdoor exercise unsafe. */
const OUTDOOR_HAZARD_KEYWORDS = [
  "tornado", "severe thunderstorm", "flash flood", "flood",
  "hurricane", "tropical storm", "tsunami",
  "air quality", "smoke", "dust",
  "excessive heat", "extreme heat", "heat advisory",
  "wind chill", "extreme cold", "cold weather",
  "high wind", "wind advisory",
  "winter storm", "blizzard", "ice storm", "freezing rain", "ice",
  "red flag", "fire weather",
  "evacuation", "shelter in place",
  "coastal flood", "lakeshore flood",
];

function warningPenalty(event: string): { penalty: number; forceDangerous: boolean; label: string } {
  const e = event.toLowerCase();
  const matched = OUTDOOR_HAZARD_KEYWORDS.some((k) => e.includes(k));
  if (!matched) return { penalty: 0, forceDangerous: false, label: "" };

  // Air-quality / smoke / dust alerts: the alert itself is the evidence, and
  // modelled US AQI often lags what the state agency saw when issuing it.
  // Treat these as a strong floor regardless of severity phrasing.
  const isAirQ = /air quality|smoke|dust/.test(e);

  // Warning / Emergency: hard downgrade.
  if (e.includes("emergency") || e.includes("warning")) {
    return { penalty: 100, forceDangerous: true, label: event };
  }
  if (e.includes("watch")) return { penalty: isAirQ ? 30 : 20, forceDangerous: false, label: event };
  // NWS "Alert" tier (e.g. Air Quality Alert) — stronger than advisory.
  if (e.includes("alert")) return { penalty: isAirQ ? 35 : 22, forceDangerous: false, label: event };
  if (e.includes("advisory") || e.includes("statement")) {
    return { penalty: isAirQ ? 28 : 12, forceDangerous: false, label: event };
  }
  return { penalty: isAirQ ? 25 : 8, forceDangerous: false, label: event };
}

// ── Per-hour scorer ─────────────────────────────────────────────────────
interface Penalty { label: string; points: number }

function scoreHour(
  h: HourlyPoint,
  aqi: number | null,
  activity: Activity,
  ctx: Pick<ComfortContext, "activeWarnings" | "spcRisk" | "fireRisk" | "wrs">,
): HourResult {
  const w = WEIGHTS[activity];
  const penalties: Penalty[] = [];

  // Weather physical factors
  penalties.push({ label: "Heat", points: heatSeverity(h.apparentTemperature) * w.heat });
  penalties.push({ label: "Cold", points: coldSeverity(h.apparentTemperature) * w.cold });
  penalties.push({ label: "Wind gusts", points: windSeverity(h.windGusts) * w.wind });
  penalties.push({ label: "Precipitation", points: precipSeverity(h.precipProbability, h.precipMm) * w.precip });
  penalties.push({ label: "UV index", points: uvSeverity(h.uvIndex) * w.uv });
  penalties.push({ label: "Air quality", points: aqSeverity(aqi) * w.aq });
  penalties.push({ label: "Humidity", points: humiditySeverity(h.humidity, h.apparentTemperature) * w.humidity });

  // Outlooks — soft downgrades
  penalties.push({ label: `SPC ${ctx.spcRisk}`, points: SPC_PENALTY[ctx.spcRisk] ?? 0 });
  penalties.push({ label: `Fire ${ctx.fireRisk}`, points: FIRE_PENALTY[ctx.fireRisk] ?? 0 });
  penalties.push({ label: "Convective (WRS)", points: 0.3 * (isFinite(ctx.wrs) ? ctx.wrs : 0) });

  // Active warnings — potential hard downgrade
  let forceDangerous = false;
  let dangerLabel = "";
  for (const ev of ctx.activeWarnings) {
    const w2 = warningPenalty(ev);
    if (w2.penalty > 0) penalties.push({ label: `Alert: ${w2.label}`, points: w2.penalty });
    if (w2.forceDangerous) { forceDangerous = true; dangerLabel = w2.label; }
  }

  const totalPenalty = penalties.reduce((s, p) => s + p.points, 0);
  let score = Math.max(0, Math.min(100, 100 - totalPenalty));
  if (forceDangerous) score = Math.min(score, 12);

  // Top limiter: single biggest penalty (or the hard warning if forced).
  let limiter = "None";
  if (forceDangerous) {
    limiter = `Active ${dangerLabel}`;
  } else {
    const top = penalties.reduce((a, b) => (b.points > a.points ? b : a), { label: "None", points: 0 });
    if (top.points >= 3) limiter = top.label;
  }

  return { time: h.time, score: Math.round(score), tier: tierFor(score), limiter };
}

// ── Public entry — one activity ─────────────────────────────────────────
export function computeComfort(
  activity: Activity,
  ctx: ComfortContext,
): ActivityResult {
  const series: HourResult[] = ctx.hourly.slice(0, 7).map((h) => {
    // Match AQ by exact time; fall back to same-index if the two feeds happen
    // to differ (Open-Meteo AQ occasionally lags by an hour).
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
