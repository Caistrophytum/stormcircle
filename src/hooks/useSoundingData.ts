import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useRefreshTick } from "./useRefreshTick";

export interface SoundingData {
  cape: number | null;
  cin: number | null;
  li: number | null;
  blh: number | null;
  lcl: number | null;
  /** Surface (2 m) relative humidity (%) — physical WRS input. */
  rhSurface: number | null;
  /** Mid-level (700 hPa) relative humidity (%) — physical WRS input. */
  rhMid: number | null;
  /** Mid-level (700 hPa) vertical velocity from OpenMeteo, in m/s. Positive = ascent (updraft), negative = subsidence. Score ramps 0.1 → 3 m/s. */
  omegaMid: number | null;
  loading: boolean;
  error: boolean;
}

const EMPTY: SoundingData = {
  cape: null,
  cin: null,
  li: null,
  blh: null,
  lcl: null,
  rhSurface: null,
  rhMid: null,
  omegaMid: null,
  loading: false,
  error: false,
};

/** Espy-style LCL approximation: LCL ≈ 125 * (T - Td), in meters AGL. */
function computeLCL(t2m: number, td2m: number): number {
  return 125 * (t2m - td2m);
}

function normalizeCIN(cin: number): number {
  return cin > 0 ? -cin : cin;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export function useSoundingData(location: LatLon | null): SoundingData {
  const [data, setData] = useState<SoundingData>(EMPTY);
  const isFetchingRef = useRef(false);
  const firstRunRef = useRef(true);
  const tick = useRefreshTick();

  useEffect(() => {
    if (!location) {
      setData(EMPTY);
      return;
    }

    let cancelled = false;
    const { lat, lon } = location;

    // `current` covers everything Open-Meteo exposes at the surface; the
    // mid-level (700 hPa) RH must come from `hourly` since pressure-level
    // variables aren't available on `current`. We grab a single forecast day
    // and pick the index matching the current UTC hour.
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,dewpoint_2m,relative_humidity_2m,cape,convective_inhibition,lifted_index,boundary_layer_height` +
      `&hourly=relative_humidity_700hPa,vertical_velocity_700hPa` +
      `&forecast_days=1&timezone=UTC`;

    const fetchSounding = async (showLoading: boolean) => {
      // In-flight guard prevents overlapping requests when Open-Meteo is slow.
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (showLoading) {
        // Only blank on the very first fetch. Background refreshes preserve
        // the last good sounding so the WRS panel never flashes "ERR" on
        // transient Open-Meteo hiccups.
        setData((prev) => ({ ...prev, loading: true, error: false }));
      }
      try {
        const res = await fetchWithTimeout(url);
        if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
        const json = await res.json();
        const c = json?.current ?? {};

        const t2m = typeof c.temperature_2m === "number" ? c.temperature_2m : null;
        const td2m = typeof c.dewpoint_2m === "number" ? c.dewpoint_2m : null;
        const lcl = t2m != null && td2m != null ? computeLCL(t2m, td2m) : null;

        // Pick the hourly samples matching the current UTC hour.
        const times: string[] = json?.hourly?.time ?? [];
        const rh700: Array<number | null> = json?.hourly?.relative_humidity_700hPa ?? [];
        const omega700: Array<number | null> = json?.hourly?.vertical_velocity_700hPa ?? [];
        let idx = 0;
        if (times.length) {
          const nowHr = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
          const found = times.findIndex((t) => t.startsWith(nowHr));
          if (found >= 0) idx = found;
        }
        const pick = (arr: Array<number | null>): number | null => {
          const v = arr[idx];
          return typeof v === "number" ? v : null;
        };
        const rhMid = rh700.length ? pick(rh700) : null;
        const omegaMid = omega700.length ? pick(omega700) : null;

        if (cancelled) return;
        setData({
          cape: typeof c.cape === "number" ? c.cape : null,
          cin: typeof c.convective_inhibition === "number" ? normalizeCIN(c.convective_inhibition) : null,
          li: typeof c.lifted_index === "number" ? c.lifted_index : null,
          blh: typeof c.boundary_layer_height === "number" ? c.boundary_layer_height : null,
          lcl,
          rhSurface: typeof c.relative_humidity_2m === "number" ? c.relative_humidity_2m : null,
          rhMid,
          omegaMid,
          loading: false,
          error: false,
        });
      } catch (err) {
        console.error("[useSoundingData] fetch failed", err);
        if (cancelled) return;
        // KEEP-LAST-GOOD: hold on to whatever we last had so the UI doesn't
        // collapse to ERR on a single fetch failure.
        setData((prev) => ({ ...prev, loading: false, error: true }));
      } finally {
        // Always release so a timeout/abort doesn't wedge future ticks.
        isFetchingRef.current = false;
      }
    };

    fetchSounding(true);
    const intervalId = setInterval(() => fetchSounding(false), 60_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [location?.lat, location?.lon]);

  return data;
}
