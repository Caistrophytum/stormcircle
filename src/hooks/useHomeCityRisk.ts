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

export type SPCRiskLevel = "NONE" | "TSTM" | "MRGL" | "SLGT" | "ENH" | "MDT" | "HIGH";

const SPC_URL =
  "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query?where=1%3D1&outFields=LABEL,ISSUE&returnGeometry=true&f=geojson";

const POLL_MS = 5 * 60 * 1000;

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

function pointInRing(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(pt: [number, number], geom: SPCFeature["geometry"]): boolean {
  const polys =
    geom.type === "Polygon"
      ? [geom.coordinates as number[][][]]
      : (geom.coordinates as number[][][][]);
  for (const poly of polys) {
    if (!poly.length) continue;
    if (!pointInRing(pt, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(pt, poly[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

async function geocodeCity(label: string): Promise<{ lat: number; lon: number } | null> {
  // Use the first comma-separated token as the city name for the geocoding query.
  const [name] = label.split(",").map((s) => s.trim());
  if (!name) return null;
  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search` +
      `?name=${encodeURIComponent(name)}&count=5&language=en&format=json&countryCode=US`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = await res.json();
    const results: any[] = json?.results ?? [];
    if (!results.length) return null;
    // Try matching the admin1 (state) part if provided.
    const parts = label.split(",").map((s) => s.trim().toLowerCase());
    const state = parts[1];
    const match =
      (state && results.find((r) => (r.admin1 ?? "").toLowerCase() === state)) ||
      results[0];
    return { lat: match.latitude, lon: match.longitude };
  } catch {
    return null;
  }
}

export function useHomeCityRisk(location: string | null): {
  risk: SPCRiskLevel;
  loading: boolean;
  coords: { lat: number; lon: number } | null;
} {
  const [risk, setRisk] = useState<SPCRiskLevel>("NONE");
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (!location) {
      setRisk("NONE");
      setCoords(null);
      return;
    }

    let cancelled = false;
    let resolved: { lat: number; lon: number } | null = null;

    async function evaluate() {
      if (cancelled) return;
      // In-flight guard: don't overlap a previous slow SPC fetch.
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setLoading(true);
      try {
        if (!resolved) {
          resolved = await geocodeCity(location!);
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
