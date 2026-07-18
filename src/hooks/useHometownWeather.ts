import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export interface HometownWeather {
  temperatureC: number | null;
  dewpointC: number | null;
  apparentTemperatureC: number | null;
  windSpeedKmh: number | null;
  uvIndex: number | null;
  loading: boolean;
  error: boolean;
}

const EMPTY: HometownWeather = {
  temperatureC: null,
  dewpointC: null,
  apparentTemperatureC: null,
  windSpeedKmh: null,
  uvIndex: null,
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
      `&current=temperature_2m,dewpoint_2m,apparent_temperature,wind_speed_10m` +
      `&hourly=uv_index` +
      `&timezone=UTC`;

    const currentHourIso = () => {
      const now = new Date();
      // Open-Meteo hourly times are ISO 8601 with :00 minutes.
      return now.toISOString().slice(0, 13) + ":00";
    };

    const fetchNow = async (showLoading: boolean) => {
      if (isFetchingRef.current) return;
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
        const uvIndex =
          times.length > 0
            ? uvValues[Math.max(0, times.indexOf(hourIso))] ?? uvValues[0] ?? null
            : null;
        if (cancelled) return;
        setData({
          temperatureC: typeof c.temperature_2m === "number" ? c.temperature_2m : null,
          dewpointC: typeof c.dewpoint_2m === "number" ? c.dewpoint_2m : null,
          apparentTemperatureC:
            typeof c.apparent_temperature === "number" ? c.apparent_temperature : null,
          windSpeedKmh: typeof c.wind_speed_10m === "number" ? c.wind_speed_10m : null,
          uvIndex: typeof uvIndex === "number" ? uvIndex : null,
          loading: false,
          error: false,
        });
      } catch (err) {
        console.error("[useHometownWeather] fetch failed", err);
        if (cancelled) return;
        setData((prev) => ({ ...prev, loading: false, error: true }));
      } finally {
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
