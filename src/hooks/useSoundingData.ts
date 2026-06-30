import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export interface SoundingData {
  cape: number | null;
  cin: number | null;
  li: number | null;
  blh: number | null;
  lcl: number | null;
  /** 10 m wind gust (m/s) — used as a "physical" WRS gate on CAPE. */
  gustMs: number | null;
  /** Surface precipitation rate (mm/h) — used as a "physical" WRS gate on CAPE. */
  precipMmH: number | null;
  loading: boolean;
  error: boolean;
}

const EMPTY: SoundingData = {
  cape: null,
  cin: null,
  li: null,
  blh: null,
  lcl: null,
  gustMs: null,
  precipMmH: null,
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

  useEffect(() => {
    if (!location) {
      setData(EMPTY);
      return;
    }

    let cancelled = false;
    const { lat, lon } = location;

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,dewpoint_2m,cape,convective_inhibition,lifted_index,boundary_layer_height,wind_gusts_10m,precipitation` +
      `&timezone=UTC`;

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

        if (cancelled) return;
        setData({
          cape: typeof c.cape === "number" ? c.cape : null,
          cin: typeof c.convective_inhibition === "number" ? normalizeCIN(c.convective_inhibition) : null,
          li: typeof c.lifted_index === "number" ? c.lifted_index : null,
          blh: typeof c.boundary_layer_height === "number" ? c.boundary_layer_height : null,
          lcl,
          gustMs: typeof c.wind_gusts_10m === "number" ? c.wind_gusts_10m : null,
          precipMmH: typeof c.precipitation === "number" ? c.precipitation : null,
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
