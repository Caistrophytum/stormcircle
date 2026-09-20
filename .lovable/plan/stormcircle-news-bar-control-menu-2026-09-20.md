# StormCircle news bar control menu

Turn the "STORMCIRCLE" masthead on the news bar into a button that opens a small drop-down panel with ticker speed, a manual refresh, and a region filter. Also add a small drop-down arrow to signal that there is a drop-down menu there, and disable the bar-clicking for speed change.

## What the user sees

Clicking the STORMCIRCLE logo opens a compact glass/neon panel below the bar (clicking the ticker area still cycles speed as it does today).

The panel contains:

1. Speed: three buttons, x0.5, x1, x2, with the active one highlighted. Choosing one applies immediately and keeps the current headline in place (no restart).
2. Update now: a button that recompiles trends from the warnings currently live in the system, straight in the browser, without waiting for the hourly server rollup. The button text shows the latest update time, for example "Update now (last 15:42)". While working it shows "Updating...".
3. Trends filter: All Trends, US Trends, EU Trends. The ticker then only shows headlines from the chosen region, and the masthead shows a small tag (ALL / US / EU) so the active filter is visible while the panel is closed.

If a filter leaves no qualifying headlines, the ticker shows "Warning trends steady" as it already does.

The panel closes on outside click or Escape. Desktop only, like the bar itself.

## Behaviour notes

- Speed preference, region filter and last manual update time persist in the browser so they survive a reload.
- Manual update only recomputes today's running counts. The three-day averages still come from the stored daily buckets, so trend wording, thresholds and colours are unchanged.
- Region is derived from the alert identifier: European rows carry the MeteoAlarm "MA-" prefix, everything else is treated as US/NWS.

## Technical details

Database (one migration):

- Add `region text NOT NULL DEFAULT 'US'` to `public.warning_daily_counts` and move the primary key to `(event, day, region)`.
- Update `public.rollup_warning_counts()` to group by event and region, where region is `CASE WHEN alert_id LIKE 'MA-%' THEN 'EU' ELSE 'US' END`. Retention and hourly schedule stay as they are.
- Regenerate Supabase types.

`src/hooks/useWarningTrends.ts`:

- Select `event, day, count, region`; add `region` to the `Trend` type.
- Accept a `region` argument ("all" | "US" | "EU"). For "all", sum counts across regions per event/day before comparing; otherwise filter to the chosen region.
- Expose `refreshNow()`: reads `alert_id, event, first_seen_at` from `active_alerts` (no geometry), counts rows with `first_seen_at` at or after the current 12Z bucket start, grouped by event and derived region, and uses those counts as today's values in place of the stored bucket for the current day. Sets `lastUpdatedAt`.
- Keep the existing gating (at least 10 percent change and at least 3 warnings difference), the Trending/Rushing/Spiking ladders and the colour mapping untouched.

`src/components/desktop/NewsBar.tsx`:

- Replace the fixed `SPEED_MULTIPLIERS` cycle constant usage with a `speed` state of 0.5, 1 or 2, still fed into the existing marquee duration maths (`minDuration` already divides by the multiplier). Clicking the ticker body keeps cycling through the same three values so current behaviour is preserved.
- Wrap the masthead in a `button`, render the drop-down with the existing glass/neon styling, and stop click propagation inside the panel so it does not also change speed.
- Persist speed, region and last update timestamp under `localStorage` keys prefixed `sc.newsbar.`.
- No em dashes in any user-visible copy.