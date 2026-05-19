/**
 * fetchWithTimeout — wraps fetch with an AbortController-based timeout.
 *
 * Default 10s is tuned for NWS / IEM / open-meteo endpoints, which can be
 * slow but never legitimately exceed 10 seconds. If the request aborts, the
 * caller's `finally` block releases any in-flight guard so the next interval
 * tick can try again cleanly.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
