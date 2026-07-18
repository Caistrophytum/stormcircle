import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useRefreshTick } from "./useRefreshTick";

export interface CurrentWeather {
  temperatureC: number | null;
  dewpointC: number | null;
  humidity: number | null;
  pressureHpa: number | null;
  loading: boolean;
  error: boolean;
}

const EMPTY: CurrentWeather = {
  temperatureC: null,
  dewpointC: null,
  humidity: null,
  pressureHpa: null,
  loading: false,
  error: false,
};

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Open-Meteo current conditions (T, Td, RH, MSLP).
 * Refreshes every 60s. Free, no API key.
 */
export function useCurrentWeather(location: LatLon | null): CurrentWeather {
  const [data, setData] = useState<CurrentWeather>(EMPTY);
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
      `&current=temperature_2m,dewpoint_2m,relative_humidity_2m,pressure_msl` +
      `&timezone=UTC`;

    const fetchNow = async (showLoading: boolean) => {
      // In-flight guard so slow Open-Meteo responses don't pile up.
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (showLoading) {
        // First load only: show a real "loading" so the UI can render a
        // skeleton. Background refreshes silently keep the last good values.
        setData((prev) => ({ ...prev, loading: true, error: false }));
      }
      try {
        const res = await fetchWithTimeout(url);
        if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
        const json = await res.json();
        const c = json?.current ?? {};
        if (cancelled) return;
        setData({
          temperatureC: typeof c.temperature_2m === "number" ? c.temperature_2m : null,
          dewpointC: typeof c.dewpoint_2m === "number" ? c.dewpoint_2m : null,
          humidity: typeof c.relative_humidity_2m === "number" ? c.relative_humidity_2m : null,
          pressureHpa: typeof c.pressure_msl === "number" ? c.pressure_msl : null,
          loading: false,
          error: false,
        });
      } catch (err) {
        console.error("[useCurrentWeather] fetch failed", err);
        if (cancelled) return;
        // KEEP-LAST-GOOD: keep prior values; just flag the error so callers
        // can show a small badge if they want. Don't blank the UI.
        setData((prev) => ({ ...prev, loading: false, error: true }));
      } finally {
        // Always release: timeouts/errors must not wedge the cycle.
        isFetchingRef.current = false;
      }
    };

    fetchNow(true);
    const id = setInterval(() => fetchNow(false), 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [location?.lat, location?.lon]);

  return data;
}
