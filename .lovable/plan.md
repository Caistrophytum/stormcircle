# Warning Trends News Bar

A slim bar across the top of the map, sitting between the "Top 10 Most Dangerous" box (left) and the "Top 10 Hazards / New" box (right), with the same spacing used around those boxes. It rotates through one headline at a time, telling you which warning types are spiking or calming down worldwide.

## What the user sees

- A glass/neon bar matching the two side panels, same top offset and same 12px gaps to each panel.
- One headline at a time, fading to the next every ~6 seconds, e.g.
  - "Flood Warning spiking — 42 today vs 3-day avg 18 (+133%)"
  - "Heat Advisory calming — 9 today vs 3-day avg 25 (-64%)"
- Types with little change are not shown. If nothing qualifies, it shows "Warning trends steady".
- During the first three days of history it shows "Building warning trends…".
- Hidden on mobile (this is the desktop map layout only).

## How the trend is measured

- A day runs from 12Z to 12Z.
- Each new warning that appears is counted once, per warning type, into that day's bucket.
- Once a type has three complete past days, its average is computed from those three days.
- The bar compares today's running count against that 3-day average: spiking if clearly above, calming if clearly below (threshold: at least 30% change and at least 3 warnings difference, to avoid noise).
- Buckets older than the three complete days (4 days prior and beyond) are deleted automatically.

## Technical details

Database (one migration):
- New table `public.warning_daily_counts (event text, day date, count integer, updated_at timestamptz)`, primary key `(event, day)` where `day` is the 12Z-to-12Z bucket date.
- `GRANT SELECT` to `anon` and `authenticated` (public read), `GRANT ALL` to `service_role`; RLS enabled with a public read policy and a service-role write policy.
- New SQL function `public.rollup_warning_counts()` (security definer): counts rows in `active_alerts` whose `first_seen_at` falls in the last hour and whose event is a Warning/Watch/Emergency-class event, and upserts them into the current bucket with `count = count + n`. Also deletes buckets older than the retention window (`day < current_bucket - 3`).
- One `pg_cron` job runs this rollup hourly (24 runs/day). Hourly is needed because short-fused warnings expire and are purged from `active_alerts` before a once-a-day pass would see them; the SQL is tiny, so recurring cost is minimal. Worst-case delay for a brand-new warning to be counted is one hour.

Frontend:
- New hook `src/hooks/useWarningTrends.ts`: reads `warning_daily_counts` once per page load (and on the shared refresh tick), computes per-event 3-day averages and today's count, and returns ranked spiking/calming headlines plus a `collecting` flag when fewer than three complete days exist.
- New component `src/components/desktop/NewsBar.tsx`: the rotating headline bar styled like `HazardTabs`/`DangerousPanel` (rounded glass panel, accent color by direction — amber for spiking, green for calming).
- `src/components/TacticalMap.tsx`: place the bar at `top-3`, positioned with `left`/`right` equal to `calc(12px + (100vw - 56px) / 3 + 12px)` so it exactly fills the space between the two panels.
