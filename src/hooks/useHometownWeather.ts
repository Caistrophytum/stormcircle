import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useRefreshTick } from "./useRefreshTick";

export interface HometownWeather {
  temperatureC: number | null;
  dewpointC: number | null;
  apparentTemperatureC: number | null;
  windSpeedKmh: number | null;
  uvIndex: number | null;
  /** Mean sea level pressure (hPa / mb). */
  pressureHpa: number | null;
  /** Change in MSLP over the past 3 hours (hPa), null when unavailable. */
  pressureTrend3hHpa: number | null;
  loading: boolean;
  error: boolean;
}

const EMPTY: HometownWeather = {
  temperatureC: null,
  dewpointC: null,
  apparentTemperatureC: null,
  windSpeedKmh: null,
  uvIndex: null,
  pressureHpa: null,
  pressureTrend3hHpa: null,
  loading: false,
  error: false,
};

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Open-Meteo current conditions for the hometown banner.
 * Returns temp, dew point, real feel (apparent temp), wind, and UV index.
 * Refreshes every 60s.
 */
export function useHometownWeather(location: LatLon | null): HometownWeather {
  const [data, setData] = useState<HometownWeather>(EMPTY);
  const isFetchingRef = useRef(false);
  // Location the currently-held values belong to; a change invalidates them.
  const lastKeyRef = useRef<string | null>(null);
  const tick = useRefreshTick();

  useEffect(() => {
    if (!location) {
      setData(EMPTY);
      lastKeyRef.current = null;
      return;
    }

    let cancelled = false;
    const { lat, lon } = location;

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,dewpoint_2m,apparent_temperature,wind_speed_10m,pressure_msl` +
      `&hourly=uv_index,pressure_msl&past_days=1` +
      `&timezone=UTC`;

    const currentHourIso = () => {
      const now = new Date();
      // Open-Meteo hourly times are ISO 8601 with :00 minutes.
      return now.toISOString().slice(0, 13) + ":00";
    };

    const fetchNow = async (showLoading: boolean) => {
      // A location change (showLoading) always wins over the in-flight guard:
      // the superseded request is already `cancelled` and will not write state.
      if (isFetchingRef.current && !showLoading) return;
      isFetchingRef.current = true;
      if (showLoading) {
        setData((prev) => ({ ...prev, loading: true, error: false }));
      }
      try {
        const res = await fetchWithTimeout(url);
        if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
        const json = await res.json();
        const c = json?.current ?? {};
        const hourly = json?.hourly ?? {};
        const times: string[] = hourly.time ?? [];
        const uvValues: number[] = hourly.uv_index ?? [];
        const hourIso = currentHourIso();
        const hourIdx = times.length > 0 ? times.indexOf(hourIso) : -1;
        const uvIndex =
          times.length > 0
            ? uvValues[Math.max(0, hourIdx)] ?? uvValues[0] ?? null
            : null;

        // 3-hour barometric trend: current MSLP minus the reading 3 hours ago.
        const mslpValues: (number | null)[] = hourly.pressure_msl ?? [];
        const pressureHpa =
          typeof c.pressure_msl === "number"
            ? c.pressure_msl
            : hourIdx >= 0 && typeof mslpValues[hourIdx] === "number"
              ? (mslpValues[hourIdx] as number)
              : null;
        const past = hourIdx >= 3 ? mslpValues[hourIdx - 3] : null;
        const pressureTrend3hHpa =
          pressureHpa != null && typeof past === "number" ? pressureHpa - past : null;
        if (cancelled) return;
        setData({
          temperatureC: typeof c.temperature_2m === "number" ? c.temperature_2m : null,
          dewpointC: typeof c.dewpoint_2m === "number" ? c.dewpoint_2m : null,
          apparentTemperatureC:
            typeof c.apparent_temperature === "number" ? c.apparent_temperature : null,
          windSpeedKmh: typeof c.wind_speed_10m === "number" ? c.wind_speed_10m : null,
          uvIndex: typeof uvIndex === "number" ? uvIndex : null,
          pressureHpa,
          pressureTrend3hHpa,
          loading: false,
          error: false,
        });
      } catch (err) {
        console.error("[useHometownWeather] fetch failed", err);
        if (cancelled) return;
        setData((prev) => ({ ...prev, loading: false, error: true }));
      } finally {
        // A superseded request must not clear the flag for the newer one.
        if (!cancelled) isFetchingRef.current = false;
      }
    };

    // New location ⇒ discard the previous city's values and show loading.
    const key = `${lat},${lon}`;
    const isNewLocation = lastKeyRef.current !== key;
    if (isNewLocation) {
      lastKeyRef.current = key;
      setData({ ...EMPTY, loading: true });
    }
    fetchNow(isNewLocation);
    return () => {
      cancelled = true;
    };
  }, [location?.lat, location?.lon, tick]);

  return data;
}

/** 3-hour barometric tendency wording. */
export function pressureTrendDescriptor(deltaHpa: number | null): string | null {
  if (deltaHpa == null) return null;
  if (deltaHpa >= 5) return "Climbing Sharply";
  if (deltaHpa >= 2) return "Climbing";
  if (deltaHpa <= -5) return "Falling Sharply";
  if (deltaHpa <= -2) return "Falling";
  return "Stable";
}
