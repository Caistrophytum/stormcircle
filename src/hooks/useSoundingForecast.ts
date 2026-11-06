import { useEffect, useState } from "react";
import { fetchJsonCached } from "@/lib/apiCache";
import type { LatLon, SoundingData } from "@/hooks/useSoundingData";
import { currentHourIndex, hourlySurface, HOURLY_UPPER, parseSounding, SURFACE_VARS } from "@/lib/soundingParse";

export interface ForecastHour {
  /** ISO UTC hour, e.g. "2026-11-06T18:00". */
  time: string;
  sounding: SoundingData;
}

/**
 * Next 24 hourly soundings for the WRS forecast slider. Lazy: fetches only
 * while `enabled` (first slider touch), shares a 30-minute cache.
 * Index 0 is the current hour, index 24 is +24h.
 */
export function useSoundingForecast(location: LatLon | null, enabled: boolean) {
  const [state, setState] = useState<{ key: string; hours: ForecastHour[]; loading: boolean }>({
    key: "",
    hours: [],
    loading: false,
  });
  const key = location ? `${location.lat},${location.lon}` : "";

  useEffect(() => {
    if (!enabled || !location) return;
    let cancelled = false;
    setState((s) => (s.key === key && s.hours.length ? s : { key, hours: [], loading: true }));
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}` +
      `&hourly=${SURFACE_VARS},${HOURLY_UPPER}&wind_speed_unit=ms&past_hours=1&forecast_hours=26&timezone=UTC`;
    fetchJsonCached<any>(url, 30 * 60_000)
      .then((json) => {
        if (cancelled) return;
        const times: string[] = json?.hourly?.time ?? [];
        const start = currentHourIndex(times);
        const hours: ForecastHour[] = [];
        for (let i = start; i < times.length && hours.length < 25; i++) {
          hours.push({
            time: times[i],
            sounding: {
              ...parseSounding(hourlySurface(json.hourly, i), json.hourly, i),
              loading: false,
              error: false,
            },
          });
        }
        setState({ key, hours, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key, hours: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const fresh = state.key === key;
  return { hours: fresh ? state.hours : [], loading: fresh && state.loading };
}
