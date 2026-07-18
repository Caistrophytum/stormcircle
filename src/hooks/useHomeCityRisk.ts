/**
 * useHomeCityRisk — given the user's saved home city string (e.g. "Norman,
 * Oklahoma"), geocodes it via Open-Meteo and resolves the current SPC Day 1
 * categorical risk level by point-in-polygon against the live SPC outlook.
 *
 * Returns one of: "NONE" | "TSTM" | "MRGL" | "SLGT" | "ENH" | "MDT" | "HIGH"
 * plus a `loading` flag. Polls SPC every 5 minutes (matches useSPCOutlook).
 */
import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { geocodeLabel } from "@/lib/openMeteo";
import { pointInPolygon } from "@/lib/pointInPolygon";

export type SPCRiskLevel = "NONE" | "TSTM" | "MRGL" | "SLGT" | "ENH" | "MDT" | "HIGH";

const SPC_URL =
  "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query?where=1%3D1&outFields=LABEL,ISSUE&returnGeometry=true&f=geojson";

// SPC convective outlook is issued a few times a day; 45 min polling is
// plenty and roughly 9× cheaper than the previous 5-minute cadence.
const POLL_MS = 45 * 60 * 1000;

const RISK_RANK: Record<string, number> = {
  TSTM: 0,
  MRGL: 1,
  SLGT: 2,
  ENH: 3,
  MDT: 4,
  HIGH: 5,
};

interface SPCFeature {
  properties: { label?: string; issue?: string };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

function pointInGeometry(pt: [number, number], geom: SPCFeature["geometry"]): boolean {
  return pointInPolygon(pt[0], pt[1], geom as GeoJSON.Polygon | GeoJSON.MultiPolygon);
}

// Geocoding now lives in src/lib/openMeteo.ts (geocodeLabel).

export function useHomeCityRisk(location: string | null): {
  risk: SPCRiskLevel;
  loading: boolean;
  coords: { lat: number; lon: number; countryCode?: string } | null;
} {
  const [risk, setRisk] = useState<SPCRiskLevel>("NONE");
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number; countryCode?: string } | null>(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (!location) {
      setRisk("NONE");
      setCoords(null);
      return;
    }

    let cancelled = false;
    let resolved: { lat: number; lon: number; countryCode?: string } | null = null;

    async function evaluate() {
      if (cancelled) return;
      // In-flight guard: don't overlap a previous slow SPC fetch.
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setLoading(true);
      try {
        if (!resolved) {
          resolved = await geocodeLabel(location!);
          if (!cancelled) setCoords(resolved);
        }
        if (!resolved || cancelled) {
          setRisk("NONE");
          return;
        }
        const res = await fetchWithTimeout(SPC_URL);
        if (!res.ok || cancelled) return;
        const geo: { features: SPCFeature[] } = await res.json();
        if (cancelled) return;
        const pt: [number, number] = [resolved.lon, resolved.lat];
        let highest: SPCRiskLevel = "NONE";
        let highestRank = -1;
        for (const f of geo.features ?? []) {
          const label = f.properties?.label;
          if (!label || !(label in RISK_RANK)) continue;
          if (!pointInGeometry(pt, f.geometry)) continue;
          const rank = RISK_RANK[label];
          if (rank > highestRank) {
            highestRank = rank;
            highest = label as SPCRiskLevel;
          }
        }
        if (!cancelled) setRisk(highest);
      } catch {
        if (!cancelled) setRisk("NONE");
      } finally {
        if (!cancelled) setLoading(false);
        // Always release the guard so the next tick can fire.
        isFetchingRef.current = false;
      }
    }

    void evaluate();
    const id = setInterval(() => void evaluate(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [location]);

  return { risk, loading, coords };
}
