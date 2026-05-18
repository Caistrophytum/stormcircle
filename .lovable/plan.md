## Goal

Eliminate the three recurring symptoms (slow login, slow/missing polygons, lists stuck "loading" + WRS ERR) by removing the **shared root cause**: duplicate hook instances each opening their own realtime channel, re-running the same `select * from active_alerts`, and clearing state on every transient error.

The auth logs confirm this — the last failed login was a **504 `context deadline exceeded` from GoTrue** because the Auth DB pool (fixed 10 connections) was saturated by the app's own redundant queries and realtime subscriptions.

---

## Confirmed duplication map

| Hook | Independent call sites |
|---|---|
| `useAlerts` | TacticalMap, EventInfoPanel, MobileMain (indirect), MobileHazards, MobileAlerts, MobileAlertsPanel |
| `useWarningPolygons` | TacticalMap, MobileMain, RadarMiniMap |
| `useAuth` | TacticalMap, StatusBar, CitizenReports, AccountCenter, MobileMain |
| `useLSR` | IntegrationPanel, MobileAlertsPanel |
| `useOnlineCount` | OnlineCounter, MobileHeader |

Each instance:
- Issues its own `.select` on mount.
- Opens its own `supabase.channel(...).on("postgres_changes", ...)`.
- Resubscribes on every fast-nav remount (StrictMode doubles it again).
- On any fetch hiccup, flips `loading: true` and blanks its UI.

This is what produces all three symptoms.

---

## Plan

### 1. One `DataProvider` for shared server state

Create `src/providers/DataProvider.tsx` wrapping `<App />` in `main.tsx`. It owns **exactly one** of each:

- `active_alerts` select + realtime channel → exposes both `useAlerts()` and `useWarningPolygons()` derived shapes (single pass over rows).
- `useAuth` session + profile state.
- `useLSR` reports state.
- `useOnlineCount` presence.

Each existing hook becomes a tiny `useContext` selector with the **same return shape and import path**, so call sites don't change.

Realtime bursts are debounced (300 ms) so a national outbreak doesn't trigger N re-renders per second.

### 2. Keep-last-good state on errors

In the provider (and in `useSoundingData` / `useCurrentWeather` / `useSPCOutlook` / `useHurricaneData`):

- On fetch error: set `error` only. **Never clear** previously loaded `data`/`polygons`/lists.
- Background refreshes use a separate `refreshing` flag; never flip `loading` back to `true` after first success.
- This eliminates the "lists disappear for minutes" and "WRS = ERR" flashes.

### 3. Server-resolve zone geometries (real fix for slow polygons)

In `supabase/functions/alerts-poll/index.ts`:

- After upsert, for each row where `geometry IS NULL` and `properties.affectedZones` is non-empty, fetch each zone URL server-side, combine into a MultiPolygon, store in `geometry`.
- Add table `zone_geom_cache (zone_url text PK, geometry jsonb, fetched_at timestamptz)` with service-role-only RLS so we don't refetch the same zones every minute.
- Client falls back to its existing on-demand fetcher only if the server hasn't filled `geometry` yet (graceful degradation, not the hot path).

Result: hundreds of cross-origin `api.weather.gov` calls per client per minute → **zero**. Polygons paint as fast as the DB select.

### 4. Fix login latency (`/auth` cold open + 504s)

- **Lazy-load routes** in `src/App.tsx`: `Auth`, `AccountCenter`, `ResetPassword`, `FAQ`, `Index`, `MobileLayout` via `React.lazy` + `Suspense`. Keeps Leaflet/Radar/Maps **out of the `/auth` bundle**.
- **Harden `useAuth`**: wrap `getSession()` in try/catch; treat `refresh_token_not_found` / network error as "signed out" immediately so `loading` resolves fast (fixes the console error currently seen on cold load).
- Add `<link rel="preconnect">` for the Supabase host in `index.html` so the first auth POST doesn't pay TLS setup.
- Reducing realtime channel count (step 1) directly relieves the auth DB pool pressure that produced the 504.

### 5. Cleanup

- Strip per-hook realtime / `setInterval(60_000)` from `useAlerts` and `useWarningPolygons`; the provider runs both once.
- Delete the `setTimeout(0)` deadlock dance in `useAuth` (provider context naturally avoids it).
- Add a tiny `useDebouncedRealtime(table, cb, ms)` helper to keep the provider readable.

---

## Technical notes

- API-compatible: `useAlerts()`, `useWarningPolygons()`, `useAuth()`, `useLSR()`, `useOnlineCount()` keep exact return types. Call sites do not change.
- New table `zone_geom_cache`: small (~5000 distinct zones nationwide); RLS = service role only.
- Lazy routes: pure `React.lazy` + Vite — no plugin, expected `/auth` bundle drop ≈ 250–400 KB gzipped (Leaflet + map components).
- Debounce window for realtime is conservative (300 ms) to keep "live" feel.
- No visual/UX changes — purely plumbing.

```text
Before                              After
N components                         N components
  ├─ N selects on active_alerts        └─ one useContext selector
  ├─ N realtime channels                     │
  ├─ N×N zone fetches → NWS                  ▼
  ├─ loading=true on any error         1 DataProvider
  └─ /auth pulls full map bundle         ├─ 1 select, 1 channel (debounced)
                                         ├─ geometry pre-resolved in DB
                                         ├─ keep-last-good on error
                                         └─ /auth chunk-split, no map deps
```

---

## Out of scope

- Visual redesign of any panel.
- Changes to severity / PDS logic (recently shipped).
- Replacing Leaflet / mapping library.
- Removing Lovable Cloud or switching auth provider.
