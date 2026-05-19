## Plan

Add two protections to every periodic fetcher:
1. **In-flight guard** — skip a tick if the previous fetch is still running, always released in `finally`.
2. **10s abort timeout** — via a shared `fetchWithTimeout(url, 10_000)` helper.

### Note on the hook list

`useAlerts`, `useWarningPolygons`, `useLSR`, `useHurricaneData`, and `useSPCOutlook` are now thin selectors — the actual periodic work was consolidated. I'll apply the pattern wherever the polling actually lives, which covers everything you intended:

| Original target | Where the interval really runs now |
|---|---|
| `useAlerts` / `useWarningPolygons` | `DataProvider` alerts + polygons loaders |
| `useLSR` | `DataProvider` LSR loader |
| `useHurricaneData` | server-driven (no client interval) — nothing to patch |
| `useSPCOutlook` | server-driven; only `useSPCOutlookLoading` still polls Supabase |

Plus the other interval pollers I'll harden the same way:
- `useNewLSRPing` (raw IEM)
- `useHomeCityRisk` (raw open-meteo + NWS SPC)
- `useCurrentWeather` (raw open-meteo)
- `useSoundingData` (raw open-meteo)
- `useRadarStationStatus` (raw NWS)
- `useSPCOutlookLoading` (Supabase poll — guard only, timeout not applicable to supabase-js)

### Shared helper

Add `src/lib/fetchWithTimeout.ts`:

```ts
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
```

Used everywhere instead of raw `fetch` for external endpoints (NWS, IEM, open-meteo, mapservices.weather.noaa.gov).

### In-flight guard

For each interval-driven hook (and the two DataProvider loaders), wrap the periodic function:

```ts
const isFetchingRef = useRef(false);

async function tick() {
  if (isFetchingRef.current) return;
  isFetchingRef.current = true;
  try {
    // existing fetch + state update
  } catch (err) {
    console.error("…", err);
  } finally {
    isFetchingRef.current = false;
  }
}
```

`finally` always releases the lock — failed or aborted fetches don't permanently wedge the refresh cycle.

### Scope notes

- On-demand fetchers triggered by user input (`useCitySearch`, `useRadar`, `useReportDistances`) get `fetchWithTimeout` for safety but no interval guard (they don't poll).
- The DataProvider alerts loader already has a debounce + cancellation flag; I'll add the in-flight guard on top so realtime bursts during a slow Supabase response don't queue extra loads.
- Zone-geometry fallback fetches in DataProvider also get `fetchWithTimeout` since NWS occasionally stalls.

### Validation

After the changes I'll spot-check that:
- Build passes.
- A simulated slow endpoint (just by reading the code paths) cannot pile up overlapping requests.
- The `finally` release is unconditional in every patched hook.