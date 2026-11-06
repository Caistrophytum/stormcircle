import { useEffect, useRef, useState } from "react";
import { fetchJsonCached } from "@/lib/apiCache";
import { useRefreshTick } from "./useRefreshTick";
import { currentHourIndex, HOURLY_UPPER, parseSounding, SURFACE_VARS } from "@/lib/soundingParse";

export interface SoundingData {
  cape: number | null;
  cin: number | null;
  li: number | null;
  blh: number | null;
  lcl: number | null;
  /**
   * Equilibrium Level (m AGL) - approximated from CAPE, LI, and LCL because
   * Open-Meteo doesn't expose a true parcel EL. Grows with buoyancy depth
   * (CAPE), instability (−LI), and cloud base (LCL); capped at 16 km.
   */
  el: number | null;
  /** Surface (2 m) relative humidity (%) - physical WRS input. */
  rhSurface: number | null;
  /** Mid-level (700 hPa) relative humidity (%) - physical WRS input. */
  rhMid: number | null;
  /** Mid-level (700 hPa) vertical velocity from OpenMeteo, in m/s. Positive = ascent (updraft), negative = subsidence. Kept for reference; no longer scored. */
  omegaMid: number | null;
  /**
   * Mid-level lapse rate (°C/km) between 700 and 500 hPa. Computed from the
   * temperatures at both levels divided by their geopotential-height
   * separation (falls back to the standard ~2.56 km when heights are absent).
   * Steep rates (≥ 7.5 °C/km) strongly favour deep convection.
   */
  lapseMid: number | null;
  /**
   * Bulk shear magnitude (m/s) approximated between 850 hPa (~1.5 km) and
   * 500 hPa (~5.5 km) - close enough to standard 0–6 km bulk shear for
   * severe-weather discrimination. Proxies storm organization / longevity.
   */
  shear: number | null;
  loading: boolean;
  error: boolean;
}

const EMPTY: SoundingData = {
  cape: null,
  cin: null,
  li: null,
  blh: null,
  lcl: null,
  el: null,
  rhSurface: null,
  rhMid: null,
  omegaMid: null,
  lapseMid: null,
  shear: null,
  loading: false,
  error: false,
};

export interface LatLon {
  lat: number;
  lon: number;
}

export function useSoundingData(location: LatLon | null): SoundingData {
  const [data, setData] = useState<SoundingData>(EMPTY);
  const isFetchingRef = useRef(false);
  // Tracks the location the current data belongs to. A change means the
  // cached values are for a different city and must not be shown as-is.
  const lastKeyRef = useRef<string | null>(null);
  const tick = useRefreshTick();

  useEffect(() => {
    if (!location) {
      setData(EMPTY);
      lastKeyRef.current = null;
      return;
    }

    let cancelled = false;
    const { lat, lon } = location;

    // `current` covers everything Open-Meteo exposes at the surface; the
    // mid-level (700 hPa) RH and 850/500 hPa winds must come from `hourly`
    // since pressure-level variables aren't available on `current`. We grab
    // a single forecast day and pick the index matching the current UTC hour.
    // Wind speeds requested in m/s to keep the shear math unit-consistent.
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=${SURFACE_VARS}` +
      `&hourly=${HOURLY_UPPER}` +
      `&wind_speed_unit=ms&forecast_days=1&timezone=UTC`;

    const fetchSounding = async (showLoading: boolean) => {
      // In-flight guard prevents overlapping requests when Open-Meteo is slow.
      // A location change (showLoading) always wins: the superseded request is
      // already `cancelled` and will never write state.
      if (isFetchingRef.current && !showLoading) return;
      isFetchingRef.current = true;
      if (showLoading) {
        // Only blank on the very first fetch. Background refreshes preserve
        // the last good sounding so the WRS panel never flashes "ERR" on
        // transient Open-Meteo hiccups.
        setData((prev) => ({ ...prev, loading: true, error: false }));
      }
      try {
        // Soundings only move hourly upstream; a 5-minute shared cache keeps
        // the desktop and mobile WRS panels from each issuing their own call.
        const json = await fetchJsonCached<any>(url, 5 * 60_000);
        const times: string[] = json?.hourly?.time ?? [];
        const parsed = parseSounding(json?.current ?? {}, json?.hourly, currentHourIndex(times));
        if (cancelled) return;
        setData({ ...parsed, loading: false, error: false });
      } catch (err) {
        console.error("[useSoundingData] fetch failed", err);
        if (cancelled) return;
        // KEEP-LAST-GOOD: hold on to whatever we last had so the UI doesn't
        // collapse to ERR on a single fetch failure.
        setData((prev) => ({ ...prev, loading: false, error: true }));
      } finally {
        // Always release so a timeout/abort doesn't wedge future ticks.
        // A superseded request must not clear the flag for the newer one.
        if (!cancelled) isFetchingRef.current = false;
      }
    };

    // Show loading (and drop the previous city's values) whenever the
    // location changes - never render another city's sounding as current.
    const key = `${lat},${lon}`;
    const isNewLocation = lastKeyRef.current !== key;
    if (isNewLocation) {
      lastKeyRef.current = key;
      setData({ ...EMPTY, loading: true });
    }
    fetchSounding(isNewLocation);

    return () => {
      cancelled = true;
      isFetchingRef.current = false;
    };
  }, [location?.lat, location?.lon, tick]);

  return data;
}
