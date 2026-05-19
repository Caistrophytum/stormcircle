import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export interface GeocodedCity {
  id: number;
  name: string;
  admin1?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
}

interface State {
  results: GeocodedCity[];
  loading: boolean;
  error: boolean;
}

const EMPTY: State = { results: [], loading: false, error: false };

/**
 * Open-Meteo geocoding (free, no key). Debounced query → city suggestions.
 * Restricted to US since the radar network is CONUS NEXRAD.
 */
export function useCitySearch(query: string): State {
  const [state, setState] = useState<State>(EMPTY);
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setState(EMPTY);
      return;
    }

    const id = ++reqId.current;
    const handle = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: false }));
      try {
        const url =
          `https://geocoding-api.open-meteo.com/v1/search` +
          `?name=${encodeURIComponent(q)}&count=8&language=en&format=json&countryCode=US`;
        const res = await fetchWithTimeout(url);
        if (!res.ok) throw new Error(`Geocoding ${res.status}`);
        const json = await res.json();
        if (id !== reqId.current) return;
        const results: GeocodedCity[] = (json?.results ?? []).map((r: any) => ({
          id: r.id,
          name: r.name,
          admin1: r.admin1,
          country_code: r.country_code,
          latitude: r.latitude,
          longitude: r.longitude,
        }));
        setState({ results, loading: false, error: false });
      } catch (err) {
        console.error("[useCitySearch] failed", err);
        if (id === reqId.current) setState({ results: [], loading: false, error: true });
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [query]);

  return state;
}
