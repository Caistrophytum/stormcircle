import { useEffect, useState } from "react";

/**
 * Shared 60-second refresh clock. All data sources that poll on a 1-minute
 * cadence (radar tiles, NWS warnings, current conditions, LSRs, etc.) can
 * subscribe to this single tick so their refreshes fire in lockstep instead
 * of drifting independently.
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
