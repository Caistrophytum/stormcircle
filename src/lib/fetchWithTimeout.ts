/**
 * fetchWithTimeout - wraps fetch with an AbortController-based timeout.
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

/** Unlike returning Response, keep the deadline active while downloading JSON. */
export async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new HttpError(response.status);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

export class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
  }
}
