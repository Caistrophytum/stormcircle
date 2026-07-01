/**
 * useExerciseComfortData — fetches the hourly weather forecast + air-quality
 * series needed by `computeComfort`. Same shape (7-hour window: current +
 * next 6) for both feeds so downstream scoring is trivial.
 *
 * Uses Open-Meteo (public, keyless, cached). Refreshes every 15 minutes.
 * Skips work entirely while coords are null.
 */
import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { HourlyPoint, AQPoint } from "@/lib/exerciseComfort";

interface Data {
  hourly: HourlyPoint[];
  airQuality: AQPoint[];
  loading: boolean;
  error: boolean;
}

const EMPTY: Data = { hourly: [], airQuality: [], loading: false, error: false };
const POLL_MS = 15 * 60 * 1000;

export function useExerciseComfortData(
  coords: { lat: number; lon: number } | null,
): Data {
  const [data, setData] = useState<Data>(EMPTY);
  const isFetching = useRef(false);

  useEffect(() => {
    if (!coords) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    const { lat, lon } = coords;

    // Round the "current hour" to top-of-hour UTC so the hourly array
    // starts from a matchable timestamp.
    const wxUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,uv_index,weather_code` +
      `&wind_speed_unit=ms&forecast_days=2&timezone=UTC`;
    const aqUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=us_aqi&forecast_days=2&timezone=UTC`;

    const run = async (showLoading: boolean) => {
      if (isFetching.current) return;
      isFetching.current = true;
      if (showLoading) setData((p) => ({ ...p, loading: true, error: false }));
      try {
        const [wxRes, aqRes] = await Promise.all([
          fetchWithTimeout(wxUrl),
          fetchWithTimeout(aqUrl),
        ]);
        if (!wxRes.ok) throw new Error(`wx ${wxRes.status}`);
        const wx = await wxRes.json();
        const aq = aqRes.ok ? await aqRes.json() : null;
        if (cancelled) return;

        const h = wx?.hourly ?? {};
        const times: string[] = h.time ?? [];
        // Find the index for the current UTC hour.
        const nowMs = Date.now();
        let startIdx = times.findIndex((t) => {
          // Open-Meteo hourly times look like "2026-07-01T14:00".
          const ts = Date.parse(t + "Z");
          return ts + 60 * 60 * 1000 > nowMs; // this hour still in the future
        });
        if (startIdx < 0) startIdx = 0;

        const pick = (arr: any[] | undefined, i: number): number | null => {
          if (!arr) return null;
          const v = arr[i];
          return typeof v === "number" ? v : null;
        };

        const hourly: HourlyPoint[] = [];
        for (let i = 0; i < 7 && startIdx + i < times.length; i++) {
          const j = startIdx + i;
          hourly.push({
            time: times[j],
            temperature: pick(h.temperature_2m, j),
            apparentTemperature: pick(h.apparent_temperature, j),
            humidity: pick(h.relative_humidity_2m, j),
            precipProbability: pick(h.precipitation_probability, j),
            precipMm: pick(h.precipitation, j),
            windSpeed: pick(h.wind_speed_10m, j),
            windGusts: pick(h.wind_gusts_10m, j),
            uvIndex: pick(h.uv_index, j),
            weatherCode: pick(h.weather_code, j),
          });
        }

        const airQuality: AQPoint[] = [];
        const ah = aq?.hourly ?? {};
        const aTimes: string[] = ah.time ?? [];
        if (aTimes.length) {
          // Align by ISO time; if the AQ feed starts at a slightly earlier
          // index just walk it forward until we're at/after the wx window.
          for (const wxTime of hourly.map((p) => p.time)) {
            const idx = aTimes.indexOf(wxTime);
            airQuality.push({
              time: wxTime,
              usAqi: idx >= 0 ? pick(ah.us_aqi, idx) : null,
            });
          }
        }

        setData({ hourly, airQuality, loading: false, error: false });
      } catch (err) {
        console.error("[useExerciseComfortData] fetch failed", err);
        if (!cancelled) setData((p) => ({ ...p, loading: false, error: true }));
      } finally {
        isFetching.current = false;
      }
    };

    void run(true);
    const id = setInterval(() => void run(false), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [coords?.lat, coords?.lon]);

  return data;
}
