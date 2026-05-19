## Plan

### What I’d change

1. **Split the shared startup loader into separate staged jobs**
   - Refactor `DataProvider` so alerts summary, polygons, LSR, auth/profile bootstrap, and presence each have their own startup path.
   - Keep the fast warning summary first, then delay heavier work (`polygons`, `LSR`, `presence`) instead of bundling everything into the first mount burst.
   - Preserve the current silent polygon fallback behavior where late geometry appends without holding the loading state open.

2. **Deduplicate auth/profile loading**
   - Stop the same profile from being fetched multiple times during `getSession()` + `onAuthStateChange()`.
   - Add a single in-flight profile fetch guard and reuse the last known profile while a refresh is happening.
   - Prevent Account Center from blocking behind redundant profile reads when the user is already known.

3. **Make heavy home-screen data route-aware**
   - Don’t force national map payloads and other home-only background jobs to compete with Account Center when the user is on `/account`.
   - Load the expensive polygon/map data only when the main deck or radar surfaces actually need it, then resume normally when returning to `/`.
   - Keep the main menu from rendering in a half-broken state by showing the last good shared snapshot until refreshed data arrives.

4. **Validate the slow paths that matter**
   - Re-test three flows: long-open tab, entering Account Center, and returning/reloading from Account Center.
   - Confirm the profile bootstrap drops to a single fetch, the first screen paints sooner, and the main deck no longer sits in a partially loaded state for minutes.

### Why this plan

- The hosted backend looks healthy right now, so this does **not** look like a backend outage.
- The current biggest client bottlenecks are:
  - a slow shared `active_alerts` request
  - repeated `profiles` requests during auth bootstrap
- The `active_alerts` table is also carrying large geometry payloads, so separating “summary data” from “map geometry” is the highest-impact frontend change.

### Technical details

- **Likely files:** `src/providers/DataProvider.tsx`, `src/pages/AccountCenter.tsx`, and any map/radar consumers that truly need polygons.
- **Database changes:** none required for the first pass.
- **If the alert request is still too slow after this:** follow up with a backend optimization pass for the alert payload shape, but I’d do the client-side split first because it directly fixes the Account Center experience too.