import { useEffect, useRef, useState } from "react";
import { searchGeocode } from "@/lib/openMeteo";

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
        const raw = await searchGeocode(q, 8);
        if (id !== reqId.current) return;
        const results: GeocodedCity[] = raw.map((r) => ({
          id: r.id as number,
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
