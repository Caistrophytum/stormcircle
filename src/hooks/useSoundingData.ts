import { useEffect, useState } from "react";

export interface SoundingData {
  cape: number | null;
  cin: number | null;
  li: number | null;
  blh: number | null;
  lcl: number | null;
  loading: boolean;
  error: boolean;
}

const EMPTY: SoundingData = {
  cape: null,
  cin: null,
  li: null,
  blh: null,
  lcl: null,
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
      `&current=temperature_2m,dewpoint_2m,cape,convective_inhibition,lifted_index,boundary_layer_height` +
      `&timezone=UTC`;

    const fetchSounding = async (showLoading: boolean) => {
      if (showLoading) {
        // Only blank on the very first fetch. Background refreshes preserve
        // the last good sounding so the WRS panel never flashes "ERR" on
        // transient Open-Meteo hiccups.
        setData((prev) => ({ ...prev, loading: true, error: false }));
      }
      try {
        const res = await fetch(url);
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
          loading: false,
          error: false,
        });
      } catch (err) {
        console.error("[useSoundingData] fetch failed", err);
        if (cancelled) return;
        // KEEP-LAST-GOOD: hold on to whatever we last had so the UI doesn't
        // collapse to ERR on a single fetch failure.
        setData((prev) => ({ ...prev, loading: false, error: true }));
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
