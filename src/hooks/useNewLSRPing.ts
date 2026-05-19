/**
 * useNewLSRPing — polls the IEM LSR feed every minute and emits an
 * incrementing counter whenever a *newer* Professional Weather Report appears
 * (i.e. one with a `valid` timestamp later than the latest seen so far).
 *
 * The first fetch after mount establishes the baseline and does NOT count
 * as a ping — only subsequent new reports trigger one.
 *
 * Consumers watch the returned `pingId` in a useEffect to fire one-shot UI
 * effects (e.g. a glow on the left menu button).
 */
import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { IEM_LSR_URL as LSR_URL } from "@/lib/endpoints";

const REFRESH_MS = 60_000;

export function useNewLSRPing(): number {
  const [pingId, setPingId] = useState(0);
  const latestSeenRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      // In-flight guard: skip if previous tick is still running so a slow
      // IEM response can't cause overlapping fetches to queue up.
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        const res = await fetchWithTimeout(LSR_URL);
        if (!res.ok) return;
        const data = await res.json();
        const features: any[] = Array.isArray(data?.features) ? data.features : [];
        let maxValid: string | null = null;
        for (const f of features) {
          const v = String(f?.properties?.valid ?? "");
          if (v && (maxValid === null || v > maxValid)) maxValid = v;
        }
        if (cancelled || !maxValid) return;

        if (!initializedRef.current) {
          latestSeenRef.current = maxValid;
          initializedRef.current = true;
          return;
        }
        if (latestSeenRef.current === null || maxValid > latestSeenRef.current) {
          latestSeenRef.current = maxValid;
          setPingId((n) => n + 1);
        }
      } catch {
        /* swallow — next tick will retry */
      } finally {
        // Always release: a thrown/aborted fetch must not permanently
        // lock the refresh cycle.
        isFetchingRef.current = false;
      }
    }

    void poll();
    const id = setInterval(poll, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return pingId;
}
