/**
 * useHomeCityFireRisk — resolves the SPC Day 1 Fire Weather categorical risk
 * for the user's saved home city via point-in-polygon against SPC's Fire
 * Weather MapServer (layer 1, categorical).
 *
 * Returns one of: "NONE" | "ELEV" | "CRIT" | "EXTM" plus a `loading` flag.
 * Polls every 5 minutes to match the other home-city hooks.
 */
import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { geocodeLabel } from "@/lib/openMeteo";
import { pointInPolygon } from "@/lib/pointInPolygon";

export type FireRiskLevel = "NONE" | "ELEV" | "CRIT" | "EXTM";

const FIRE_URL =
  "https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/1/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson";

const POLL_MS = 5 * 60 * 1000;

// SPC fire layer encodes severity in the `dn` field.
const DN_TO_LEVEL: Record<number, FireRiskLevel> = { 5: "ELEV", 8: "CRIT", 10: "EXTM" };
const RANK: Record<FireRiskLevel, number> = { NONE: 0, ELEV: 1, CRIT: 2, EXTM: 3 };

interface Feat {
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
}

export function useHomeCityFireRisk(location: string | null): {
  risk: FireRiskLevel;
  loading: boolean;
} {
  const [risk, setRisk] = useState<FireRiskLevel>("NONE");
  const [loading, setLoading] = useState(false);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (!location) {
      setRisk("NONE");
      return;
    }
    let cancelled = false;
    let resolved: { lat: number; lon: number } | null = null;

    async function evaluate() {
      if (cancelled || isFetchingRef.current) return;
      isFetchingRef.current = true;
      setLoading(true);
      try {
        if (!resolved) resolved = await geocodeLabel(location!);
        if (!resolved || cancelled) { setRisk("NONE"); return; }
        const res = await fetchWithTimeout(FIRE_URL);
        if (!res.ok || cancelled) return;
        const geo: { features: Feat[] } = await res.json();
        if (cancelled) return;
        const pt: [number, number] = [resolved.lon, resolved.lat];
        let highest: FireRiskLevel = "NONE";
        for (const f of geo.features ?? []) {
          const dn = Number((f.properties as { dn?: unknown })?.dn);
          const level = DN_TO_LEVEL[dn];
          if (!level) continue;
          if (!pointInPolygon(pt[0], pt[1], f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)) continue;
          if (RANK[level] > RANK[highest]) highest = level;
        }
        if (!cancelled) setRisk(highest);
      } catch {
        if (!cancelled) setRisk("NONE");
      } finally {
        if (!cancelled) setLoading(false);
        isFetchingRef.current = false;
      }
    }

    void evaluate();
    const id = setInterval(() => void evaluate(), POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [location]);

  return { risk, loading };
}
