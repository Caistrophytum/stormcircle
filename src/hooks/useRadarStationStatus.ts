import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

/**
 * Fetches NWS radar station latency info and returns a map of station id →
 * timestamp (ms) of the last received Level II data. Refreshes every 2 minutes.
 */
export function useRadarStationStatus() {
  const [lastReceived, setLastReceived] = useState<Record<string, number>>({});
  const isFetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      // In-flight guard: skip overlapping fetches when NWS is slow.
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        const res = await fetchWithTimeout(
          "https://api.weather.gov/radar/stations?stationType=WSR-88D",
          { headers: { Accept: "application/geo+json" } },
        );
        if (!res.ok) throw new Error(`NWS ${res.status}`);
        const json = await res.json();
        const map: Record<string, number> = {};
        for (const f of json.features ?? []) {
          const id = f?.properties?.id;
          const ts = f?.properties?.latency?.levelTwoLastReceivedTime;
          if (id && ts) {
            const t = Date.parse(ts);
            if (!Number.isNaN(t)) map[id] = t;
          }
        }
        if (!cancelled) setLastReceived(map);
      } catch (err) {
        console.warn("[useRadarStationStatus] fetch failed", err);
      } finally {
        // Always release the lock so timeouts can't wedge the cycle.
        isFetchingRef.current = false;
      }
    };

    fetchStatus();
    const id = setInterval(fetchStatus, 120_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return lastReceived;
}
