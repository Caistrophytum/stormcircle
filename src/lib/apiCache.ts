/**
 * fetchJsonCached - shared TTL cache + in-flight dedupe for external GETs.
 *
 * Why this exists:
 *   Five separate hooks (useCurrentWeather, useSoundingData, useHometownWeather,
 *   useExerciseComfortData, useLocalClock) each hit api.open-meteo.com on their
 *   own schedule, for the same handful of coordinates. Mount two of them at
 *   once, or switch tabs back and forth, and the same URL went out repeatedly
 *   within seconds. That is wasted latency for the user and needless exposure
 *   to Open-Meteo's rate limits.
 *
 * Behaviour:
 *   - Identical URLs requested while one is already in flight share the same
 *     promise (no thundering herd on a city switch).
 *   - Successful responses are cached for `ttlMs`; failures are never cached,
 *     so a transient outage does not stick.
 *   - The cache is bounded so a long session cannot grow it without limit.
 */
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

interface Entry {
  expires: number;
  value: unknown;
}

const MAX_ENTRIES = 120;
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function prune() {
  const now = Date.now();
  for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
  // Still oversized after dropping expired entries: evict oldest inserted.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export async function fetchJsonCached<T = unknown>(
  url: string,
  ttlMs: number,
  timeoutMs = 10_000,
): Promise<T> {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    const res = await fetchWithTimeout(url, {}, timeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    cache.set(url, { expires: Date.now() + ttlMs, value: json });
    prune();
    return json;
  })().finally(() => {
    inflight.delete(url);
  });

  inflight.set(url, promise);
  return promise as Promise<T>;
}

/** Drop everything, e.g. after the user forces a manual refresh. */
export function clearApiCache() {
  cache.clear();
}
