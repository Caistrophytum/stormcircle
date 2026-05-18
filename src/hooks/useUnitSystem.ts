import { useEffect, useState } from "react";

export type UnitSystem = "metric" | "imperial";

const SUBS = new Set<(s: UnitSystem) => void>();
const LS_KEY = "stormcircle-unit-system";

function isUnitSystem(value: string | null): value is UnitSystem {
  return value === "metric" || value === "imperial";
}

function detectInitialUnitSystem(): UnitSystem {
  if (typeof window === "undefined") return "imperial";

  try {
    const saved = window.localStorage.getItem(LS_KEY);
    if (isUnitSystem(saved)) return saved;
  } catch {
    // Ignore storage failures (private mode, blocked storage, etc.)
  }

  const locale =
    Intl.DateTimeFormat().resolvedOptions().locale ||
    window.navigator.language ||
    "en-US";
  const region = locale.split("-")[1]?.toUpperCase();
  return region && ["US", "LR", "MM"].includes(region) ? "imperial" : "metric";
}

let current: UnitSystem = detectInitialUnitSystem();

/**
 * Stable global unit system.
 *
 * The old implementation flipped units every 3 seconds, which forced large
 * parts of the UI to re-render continuously and made the app look broken.
 */
export function useUnitSystem(): UnitSystem {
  const [system, setSystem] = useState<UnitSystem>(current);

  useEffect(() => {
    SUBS.add(setSystem);
    return () => {
      SUBS.delete(setSystem);
    };
  }, []);

  return system;
}

export function setUnitSystem(next: UnitSystem) {
  if (next === current) return;
  current = next;
  try {
    window.localStorage.setItem(LS_KEY, next);
  } catch {
    // Ignore storage failures
  }
  SUBS.forEach((fn) => fn(next));
}

export function toggleUnitSystem() {
  setUnitSystem(current === "metric" ? "imperial" : "metric");
}

// ---------- Conversion helpers ----------

export const cToF = (c: number) => c * 9 / 5 + 32;
export const mToFt = (m: number) => m * 3.28084;
export const kmToMi = (km: number) => km * 0.621371;
export const hpaToInHg = (hpa: number) => hpa * 0.02953;

export interface DisplayValue {
  value: number;
  unit: string;
}

export function displayTemp(c: number | null, system: UnitSystem): DisplayValue | null {
  if (c == null) return null;
  return system === "metric" ? { value: c, unit: "°C" } : { value: cToF(c), unit: "°F" };
}

export function displayLengthM(m: number | null, system: UnitSystem): DisplayValue | null {
  if (m == null) return null;
  return system === "metric" ? { value: m, unit: "m" } : { value: mToFt(m), unit: "ft" };
}

export function displayLengthKm(km: number | null, system: UnitSystem): DisplayValue | null {
  if (km == null) return null;
  return system === "metric" ? { value: km, unit: "km" } : { value: kmToMi(km), unit: "mi" };
}

export function displayPressure(hpa: number | null, system: UnitSystem): DisplayValue | null {
  if (hpa == null) return null;
  return system === "metric"
    ? { value: hpa, unit: "hPa" }
    : { value: hpaToInHg(hpa), unit: "inHg" };
}
