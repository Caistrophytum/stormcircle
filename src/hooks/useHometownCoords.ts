/**
 * useHometownCoords - resolves the lat/lon of the signed-in user's saved
 * hometown (profile.location). The geocode result is cached in localStorage so
 * the lookup runs at most once per label per browser.
 */
import { useEffect, useState } from "react";
import { geocodeLabel } from "@/lib/openMeteo";
import { useAuth } from "@/hooks/useAuth";
import { useRefreshTick } from "@/hooks/useRefreshTick";

const CACHE_KEY = "home-coords-v1";

export interface HomeCoords {
  lat: number;
  lon: number;
  countryCode?: string;
}

function readCache(): Record<string, HomeCoords> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([, value]) =>
      value && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 &&
      Number.isFinite(value.lon) && Math.abs(value.lon) <= 180,
    ));
  } catch {
    return {};
  }
}

export function useHometownCoords(): HomeCoords | null {
  const { profile } = useAuth();
  const label = profile?.location ?? null;
  const tick = useRefreshTick();
  const [coords, setCoords] = useState<HomeCoords | null>(() =>
    label ? (readCache()[label] ?? null) : null,
  );

  useEffect(() => {
    if (!label) {
      setCoords(null);
      return;
    }
    const cached = readCache()[label];
    if (cached) {
      setCoords(cached);
      return;
    }
    setCoords(null);
    let cancelled = false;
    void (async () => {
      const res = await geocodeLabel(label);
      if (cancelled || !res) return;
      const value: HomeCoords = {
        lat: res.lat,
        lon: res.lon,
        countryCode: res.countryCode,
      };
      setCoords(value);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...readCache(), [label]: value }));
      } catch {
        /* quota - ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [label, tick]);

  return coords;
}
