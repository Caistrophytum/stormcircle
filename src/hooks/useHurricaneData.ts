/**
 * useHurricaneData — polls the NHC CurrentStorms.json operational feed every
 * 30 minutes and exposes a normalized list of active tropical cyclones plus
 * a hurricane-season status flag.
 *
 * NHC issues advisories every 3-6 hours so a 30-minute poll is plenty.
 * Off-season the feed simply returns an empty `activeStorms` array, which we
 * surface as `storms: []` while still reporting season status.
 */
import { useEffect, useRef, useState } from "react";

const NHC_JSON = "https://www.nhc.noaa.gov/CurrentStorms.json";
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

const CLASSIFICATIONS: Record<string, string> = {
  TD: "Tropical Depression",
  TS: "Tropical Storm",
  HU: "Hurricane",
  TY: "Typhoon",
  STY: "Super Typhoon",
  TC: "Tropical Cyclone",
  STD: "Subtropical Depression",
  STS: "Subtropical Storm",
  EX: "Post-Tropical Cyclone",
  LO: "Low",
  DB: "Disturbance",
};

export interface Storm {
  id: string;
  name: string;
  classification: string;
  classificationLabel: string;
  dangerLevel: string;
  intensity: number;
  intensityMph: number;
  pressure: number;
  lat: number;
  lon: number;
  latStr: string;
  lonStr: string;
  movementDir: number;
  movementDirCompass: string;
  movementSpeed: number;
  lastUpdate: Date;
  advisoryUrl: string;
  discussionUrl: string;
  forecastGraphicsUrl: string;
  isDangerous: boolean;
}

export interface HurricaneSeason {
  active: boolean;
  basin: string;
}

/**
 * Lightweight date-only check for whether the Atlantic and/or Eastern Pacific
 * hurricane seasons are currently active. Atlantic runs June 1 – Nov 30 (with
 * an "early season" tail starting May 15); Eastern Pacific runs May 15 – Nov 30.
 * Returns both the boolean and a human label describing which basins apply.
 */
export function isHurricaneSeason(): HurricaneSeason {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const atlantic = (month >= 6 && month <= 11) || (month === 5 && day >= 15);
  const pacific = month >= 5 && month <= 11;
  return {
    active: atlantic || pacific,
    basin:
      atlantic && pacific
        ? "Atlantic & Eastern Pacific"
        : atlantic
          ? "Atlantic"
          : pacific
            ? "Eastern Pacific"
            : "None",
  };
}

/**
 * Operational danger label used in bot messages. Thresholds:
 *   - HU ≥ 96 kt → Major Hurricane (Cat 3+)
 *   - HU         → Hurricane (Cat 1–2)
 *   - TS ≥ 55 kt → Strong Tropical Storm (approaching hurricane strength)
 *   - TS         → Tropical Storm
 *   - other      → Watch (depressions, sub-tropical, post-tropical, etc.)
 */
function getDangerLevel(classification: string, intensity: number): string {
  if (classification === "HU" && intensity >= 96) return "MAJOR HURRICANE";
  if (classification === "HU") return "HURRICANE";
  if (classification === "TS" && intensity >= 55) return "STRONG TROPICAL STORM";
  if (classification === "TS") return "TROPICAL STORM";
  return "WATCH";
}

/** Convert a meteorological bearing (0–360°, 0 = N) into a 16-point compass label. */
function degToCompass(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

/**
 * Tolerant numeric parser — NHC sometimes returns numeric fields as strings
 * (e.g. "1003" mb, "17.1" lat) and sometimes as JSON numbers. Returns the
 * `fallback` for null/undefined/NaN inputs so downstream math stays safe.
 */
function parseNum(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/**
 * Subset of the CurrentStorms.json `activeStorms[]` shape we actually read.
 * Fields are all optional because NHC occasionally omits or renames them
 * (e.g. early-season disturbances may not have a `forecastDiscussion`).
 */
interface RawStorm {
  id?: string;
  binNumber?: string;
  name?: string;
  classification?: string;
  intensity?: string | number;
  pressure?: string | number;
  latitude?: string | number;
  latitudeNumeric?: number;
  longitude?: string | number;
  longitudeNumeric?: number;
  movementDir?: string | number;
  movementSpeed?: string | number;
  lastUpdate?: string;
  publicAdvisory?: { url?: string };
  forecastDiscussion?: { url?: string };
  forecastGraphics?: { url?: string };
  trackCone?: { url?: string };
}

/**
 * Normalize an NHC raw storm entry into our `Storm` shape. Returns null for
 * malformed entries (missing id/name/classification) so the caller can drop
 * them silently rather than rendering a broken bot message.
 */
function normalizeStorm(raw: RawStorm): Storm | null {
  const id = raw.id ?? raw.binNumber;
  const name = raw.name;
  const classification = (raw.classification ?? "").toUpperCase();
  if (!id || !name || !classification) return null;

  // Round wind/pressure to whole units — they're operationally reported as
  // integers; the API sometimes returns fractional analysis values.
  const intensity = Math.round(parseNum(raw.intensity));
  const pressure = Math.round(parseNum(raw.pressure));
  // Prefer the explicit numeric fields when present (avoid string parsing).
  const lat = parseNum(raw.latitudeNumeric ?? raw.latitude);
  const lon = parseNum(raw.longitudeNumeric ?? raw.longitude);
  const latStr = `${Math.abs(lat).toFixed(1)}${lat >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(lon).toFixed(1)}${lon >= 0 ? "E" : "W"}`;
  const movementDir = parseNum(raw.movementDir);
  const movementSpeed = parseNum(raw.movementSpeed);
  const lastUpdate = raw.lastUpdate ? new Date(raw.lastUpdate) : new Date();
  // "Dangerous" = hurricane-tier classification OR a strong TS approaching
  // hurricane strength. Drives whether we post the extra danger detail card.
  const isDangerous = classification === "HU" || classification === "TY" || classification === "STY" || intensity >= 50;

  return {
    id,
    name,
    classification,
    classificationLabel: CLASSIFICATIONS[classification] ?? classification,
    dangerLevel: getDangerLevel(classification, intensity),
    intensity,
    intensityMph: Math.round(intensity * 1.151),
    pressure,
    lat,
    lon,
    latStr,
    lonStr,
    movementDir,
    movementDirCompass: degToCompass(movementDir),
    movementSpeed,
    lastUpdate,
    advisoryUrl: raw.publicAdvisory?.url ?? "",
    discussionUrl: raw.forecastDiscussion?.url ?? "",
    forecastGraphicsUrl: raw.forecastGraphics?.url ?? raw.trackCone?.url ?? "",
    isDangerous,
  };
}

export interface HurricaneData {
  season: HurricaneSeason;
  storms: Storm[];
  dangerousStorms: Storm[];
  loading: boolean;
  lastAdvisory: Date | null;
}

export function useHurricaneData(): HurricaneData {
  const [storms, setStorms] = useState<Storm[]>([]);
  const [loading, setLoading] = useState(true);
  const seasonRef = useRef<HurricaneSeason>(isHurricaneSeason());

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = await fetch(NHC_JSON, { cache: "no-store" });
        if (!res.ok) return;
        const json: { activeStorms?: RawStorm[] } = await res.json();
        const raws = Array.isArray(json?.activeStorms) ? json.activeStorms : [];
        const next = raws
          .map(normalizeStorm)
          .filter((s): s is Storm => s !== null);
        if (!cancelled) setStorms(next);
      } catch (e) {
        console.warn("[useHurricaneData] fetch failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const dangerousStorms = storms.filter((s) => s.isDangerous);
  const lastAdvisory =
    storms.length > 0
      ? new Date(Math.max(...storms.map((s) => s.lastUpdate.getTime())))
      : null;

  return {
    season: seasonRef.current,
    storms,
    dangerousStorms,
    loading,
    lastAdvisory,
  };
}
