/**
 * useReportDistances — given a list of stacked reports and the user's home
 * city string, geocodes the place mentioned in each report and returns a
 * Map<stackId, distanceKm>. Stacks whose place can't be parsed/geocoded
 * get `Infinity` so they sink to the bottom of a "nearest" sort.
 *
 * Geocodes are cached in-module so repeated renders/realtime updates don't
 * re-hit Open-Meteo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { StackedReport } from "@/lib/reportGrouping";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { geocodeLabel } from "@/lib/openMeteo";

const RELATIONS = [" heading towards ", " near ", " in "];

export function extractPlace(content: string): string | null {
  const lower = content.toLowerCase();
  for (const rel of RELATIONS) {
    const idx = lower.indexOf(rel);
    if (idx >= 0) {
      const place = content.slice(idx + rel.length).trim();
      return place || null;
    }
  }
  return null;
}

const geocodeCache = new Map<string, { lat: number; lon: number } | null>();
const inflight = new Map<string, Promise<{ lat: number; lon: number } | null>>();

async function geocodePlace(label: string): Promise<{ lat: number; lon: number } | null> {
  const key = label.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  if (inflight.has(key)) return inflight.get(key)!;
  const p = geocodeLabel(label).then((coords) => {
    geocodeCache.set(key, coords);
    inflight.delete(key);
    return coords;
  });
  inflight.set(key, p);
  return p;
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useReportDistances(
  stacks: StackedReport[],
  homeLocation: string | null,
  enabled: boolean,
): Map<string, number> {
  const [home, setHome] = useState<{ lat: number; lon: number } | null>(null);
  const [tick, setTick] = useState(0);
  const placeCoordsRef = useRef<Map<string, { lat: number; lon: number } | null>>(new Map());

  // Resolve home coords
  useEffect(() => {
    if (!enabled || !homeLocation) {
      setHome(null);
      return;
    }
    let cancelled = false;
    void geocodePlace(homeLocation).then((c) => {
      if (!cancelled) setHome(c);
    });
    return () => {
      cancelled = true;
    };
  }, [homeLocation, enabled]);

  // Resolve coords for every stack place
  useEffect(() => {
    if (!enabled || !home) return;
    let cancelled = false;
    const places = new Set<string>();
    for (const s of stacks) {
      const p = extractPlace(s.topic);
      if (p) places.add(p);
    }
    Promise.all(
      Array.from(places).map(async (p) => {
        const c = await geocodePlace(p);
        placeCoordsRef.current.set(p.toLowerCase().trim(), c);
      }),
    ).then(() => {
      if (!cancelled) setTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [stacks, home, enabled]);

  return useMemo(() => {
    const out = new Map<string, number>();
    if (!enabled || !home) return out;
    for (const s of stacks) {
      const p = extractPlace(s.topic);
      if (!p) {
        out.set(s.id, Infinity);
        continue;
      }
      const c = placeCoordsRef.current.get(p.toLowerCase().trim());
      out.set(s.id, c ? haversineKm(home, c) : Infinity);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stacks, home, enabled, tick]);
}
