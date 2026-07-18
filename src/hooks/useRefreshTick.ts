import { useEffect, useState } from "react";

/**
 * Shared 60-second refresh clock. Every consumer that wants to refetch or
 * re-evaluate on a 1-minute cadence subscribes here, so all background
 * activity fires in lockstep (single event-loop wake, coalesced network
 * bursts, easier debugging, better background-tab throttling).
 *
 * Current consumers:
 *   • RadarMiniMap                 — cache-buster for tile URLs
 *   • useCurrentWeather            — Open-Meteo current (T/Td/RH/MSLP)
 *   • useHometownWeather           — hometown banner metrics
 *   • useSoundingData              — CAPE/CIN/LI + moisture/lift
 *   • DataProvider alerts loader   — NWS active_alerts summary + polygons
 *   • DataProvider LSR loader      — IEM local storm reports
 *   • CitizenReports expiry sweep  — prune >2h-old messages locally
 *
 * The tick is a monotonically increasing integer; consumers can use it as a
 * cache-buster, dependency in `useEffect`, or React `key`.
 */
const REFRESH_INTERVAL_MS = 60_000;

let currentTick = 0;
const subscribers = new Set<(tick: number) => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function ensureTicker() {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    currentTick += 1;
    subscribers.forEach((fn) => fn(currentTick));
  }, REFRESH_INTERVAL_MS);
}

export function useRefreshTick(): number {
  const [tick, setTick] = useState(currentTick);

  useEffect(() => {
    ensureTicker();
    subscribers.add(setTick);
    return () => {
      subscribers.delete(setTick);
    };
  }, []);

  return tick;
}
