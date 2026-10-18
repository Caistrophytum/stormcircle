import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearApiCache, fetchJsonCached } from "./apiCache";

describe("cached JSON recovery", () => {
  beforeEach(() => { clearApiCache(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("aborts a stalled body, releases dedupe, and recovers with a shared retry", async () => {
    const fetch = vi.fn()
      .mockImplementationOnce((_url, init) => Promise.resolve({
        ok: true,
        json: () => new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
      }))
      .mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: 24 } }) });
    vi.stubGlobal("fetch", fetch);
    const first = fetchJsonCached("https://weather.test/stalled", 60_000, 100);
    const second = fetchJsonCached("https://weather.test/stalled", 60_000, 100);
    await vi.advanceTimersByTimeAsync(1100);
    expect(await first).toEqual({ current: { temperature_2m: 24 } });
    expect(await second).toEqual(await first);
    expect(fetch).toHaveBeenCalledTimes(2);
    await fetchJsonCached("https://weather.test/stalled", 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry or cache rate-limit failures", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValue({ ok: true, json: async () => ({ aqi: 42 }) });
    vi.stubGlobal("fetch", fetch);
    await expect(fetchJsonCached("https://weather.test/aqi", 60_000)).rejects.toThrow("HTTP 429");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await fetchJsonCached("https://weather.test/aqi", 60_000)).toEqual({ aqi: 42 });
  });
});