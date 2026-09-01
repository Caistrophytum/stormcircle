/**
 * rate-limit.ts - tiny in-memory sliding-window limiter for edge functions.
 *
 * Each edge-function isolate keeps its own map, so this is a best-effort
 * throttle (abuse spread across many cold isolates can slip through) but it
 * is enough to stop a single client from hammering an endpoint in a loop.
 * Entries are pruned lazily so the map cannot grow unbounded.
 */
const HITS = new Map<string, number[]>();
const MAX_KEYS = 5_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number; // seconds until the caller may try again
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Lazy prune: drop stale keys once the map grows large.
  if (HITS.size > MAX_KEYS) {
    for (const [k, times] of HITS) {
      if (!times.some((t) => t > cutoff)) HITS.delete(k);
    }
  }

  const recent = (HITS.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    HITS.set(key, recent);
    return { allowed: false, retryAfter };
  }

  recent.push(now);
  HITS.set(key, recent);
  return { allowed: true, retryAfter: 0 };
}

/** Best-effort client identifier from proxy headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}
