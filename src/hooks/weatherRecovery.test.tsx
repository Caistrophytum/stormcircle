import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentWeather } from "./useCurrentWeather";
import { useHometownWeather } from "./useHometownWeather";
import { useSoundingData } from "./useSoundingData";
import { useExerciseComfortData } from "./useExerciseComfortData";
import { useHometownCoords } from "./useHometownCoords";

let tick = 0;
let label = "Gan Yavne, IL";
vi.mock("./useRefreshTick", () => ({ useRefreshTick: () => tick }));
vi.mock("./useAuth", () => ({ useAuth: () => ({ profile: { location: label } }) }));
vi.mock("@/lib/apiCache", () => ({ fetchJsonCached: vi.fn() }));
vi.mock("@/lib/openMeteo", () => ({ geocodeLabel: vi.fn() }));
import { fetchJsonCached } from "@/lib/apiCache";
import { geocodeLabel } from "@/lib/openMeteo";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const reading = { current: { temperature_2m: 24, cape: 240, us_aqi: 42 } };
describe("weather request lifecycle", () => {
  beforeEach(() => { vi.resetAllMocks(); tick = 0; localStorage.clear(); label = "Gan Yavne, IL"; });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["current", useCurrentWeather, "temperatureC", 24],
    ["hometown", useHometownWeather, "temperatureC", 24],
    ["sounding", useSoundingData, "cape", 240],
  ] as const)("%s resumes after a tick supersedes an unfinished request", async (_name, hook, field, value) => {
    const pending = deferred<typeof reading>();
    vi.mocked(fetchJsonCached).mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(() => hook({ lat: 31, lon: 34 }));
    tick++;
    rerender();
    await act(async () => pending.resolve(reading));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect((result.current as unknown as Record<string, unknown>)[field]).toBe(value);
  });

  it("exercise fetches a new city even while the old city's request is running", async () => {
    const old = deferred<unknown>();
    vi.mocked(fetchJsonCached).mockImplementation((url) => {
      if (url.includes("latitude=31&")) return old.promise;
      return Promise.resolve({ hourly: { time: [new Date().toISOString().slice(0, 13) + ":00"], temperature_2m: [18] } });
    });
    const { result, rerender } = renderHook(({ lat }) => useExerciseComfortData({ lat, lon: 34 }), { initialProps: { lat: 31 } });
    rerender({ lat: 32 });
    await waitFor(() => expect(result.current.hourly[0]?.temperature).toBe(18));
    await act(async () => old.resolve({ hourly: {} }));
    expect(result.current.hourly[0]?.temperature).toBe(18);
  });

  it("retries a failed hometown lookup on the shared refresh and clears the old city's coordinates", async () => {
    vi.mocked(geocodeLabel).mockResolvedValueOnce(null).mockResolvedValueOnce({ lat: 31, lon: 34 });
    const { result, rerender } = renderHook(() => useHometownCoords());
    await waitFor(() => expect(geocodeLabel).toHaveBeenCalledTimes(1));
    tick++;
    rerender();
    await waitFor(() => expect(result.current?.lat).toBe(31));
    const next = deferred<null>();
    vi.mocked(geocodeLabel).mockReturnValue(next.promise);
    label = "London, GB";
    rerender();
    expect(result.current).toBeNull();
    await act(async () => next.resolve(null));
  });
});