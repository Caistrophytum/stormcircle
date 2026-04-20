import { useEffect, useState } from "react";

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
      if (showLoading) {
        setData({ ...EMPTY, loading: true });
      }
      try {
        const res = await fetch(url);
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
        if (!cancelled) setData({ ...EMPTY, error: true });
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
