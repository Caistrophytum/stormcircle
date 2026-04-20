import { useEffect, useState } from "react";

export type UnitSystem = "metric" | "imperial";

const SUBS = new Set<(s: UnitSystem) => void>();
let current: UnitSystem = "metric";
let intervalId: ReturnType<typeof setInterval> | null = null;

function ensureTicker() {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    current = current === "metric" ? "imperial" : "metric";
    SUBS.forEach((fn) => fn(current));
  }, 3000);
}

/**
 * Global unit system that auto-toggles every 3 seconds between metric and imperial.
 * All consumers share the same value so the whole UI flips in lockstep.
 */
export function useUnitSystem(): UnitSystem {
  const [system, setSystem] = useState<UnitSystem>(current);

  useEffect(() => {
    ensureTicker();
    SUBS.add(setSystem);
    return () => {
      SUBS.delete(setSystem);
    };
  }, []);

  return system;
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
