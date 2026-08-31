# Reliable 1-minute warnings and radar, plus a code clean-up

## Goal

Make European and US warnings and radar refresh on the same 1-minute rhythm, and tidy the radar code so it reads clearly. All other timed jobs (fire, SPC, hurricane, ENSO, notifications, maintenance) stay exactly as they are.

## Current state

- US warnings: the `alerts-poll` job runs every minute.
- European warnings: the `meteoalarm-poll` job runs every 15 minutes, so a European warning can be up to 15 minutes late.
- Browser side: warnings, weather and NEXRAD radar tiles all refresh on one shared 60-second clock, but the European radar composite runs its own separate 10-minute timer.

## What changes

### 1. Warnings on one 1-minute rhythm

Move the European warnings job to every minute, matching the US job.

To keep that affordable and reliable, the European poller becomes smarter instead of simply running 15x more often:
- Ask each country feed "has anything changed since last time?" (conditional request). Unchanged feeds return an empty answer and cost almost nothing.
- Only download the full warning documents for warnings that are new or updated; already-stored ones are skipped.
- Keep the existing bounded parallelism and the stale-row clean-up so old warnings still disappear.

Trade-off to be aware of: even with change detection, a 1-minute European poll does more background work than a 15-minute one. The clean-up above keeps the extra cost small (mostly tiny "not modified" replies), and no other jobs get more frequent.

### 2. Radar on the same 1-minute rhythm

The European composite currently refreshes on its own 10-minute timer. It moves onto the same shared 60-second clock the US radar already uses, so both regions update together and a stale frame can never linger for minutes. The upstream composite itself updates roughly every 5-10 minutes, so the extra checks are cheap and simply pick up a new frame the moment it exists.

If a frame fetch fails, the current frame stays on screen instead of blanking the map.

### 3. Clean-up and readability

- Remove leftovers that nothing uses any more: the unused MeteoGate service constant, the unused "manual override active" flag, and stale comments that describe behaviour that has since changed.
- Pull the "is this location US or European" decision into one small, named helper used by both the overlay choice and the map centring, instead of the same coordinate checks appearing in two places.
- Give the radar hook a short header comment stating the rule in one sentence: US -> nearest NEXRAD site, Europe/Israel -> composite centred on the location, manual button overrides both.
- Refresh the shared-clock comment so it lists the real consumers, including the European radar.
- No visual or behavioural change from this section.

## Technical notes

- `cron.job` 206 (`meteoalarm-poll-15min`) is rescheduled to `* * * * *` and renamed `meteoalarm-poll-1min`; job 52 (`alerts-poll-1min`) is unchanged. All other jobs (46, 55, 60, 61, 62, 195, 199) stay as they are.
- `supabase/functions/meteoalarm-poll/index.ts`: store per-feed `ETag`/`Last-Modified` and send `If-None-Match`/`If-Modified-Since`; treat `304` as "no change". Skip CAP document downloads for CAP identifiers already present and unchanged in `active_alerts`. Redeploy after editing.
- `src/hooks/useRadar.ts`: drop the local `window.setInterval(load, 10 * 60 * 1000)` and re-fetch the frame off `useRefreshTick()`; keep the previous frame when a fetch returns null. Extract `isUsCoord` + region resolution into one helper; remove `radarModeManual` from the return value.
- `src/lib/euRadar.ts`: remove `EU_RADAR_BASE`; keep the bounding box, frame fetch and tile URL (colour table 6).
- Verification: typecheck and build, a manual invoke of the European poller to confirm it still upserts warnings, and a Playwright pass on the radar panel to confirm the composite still renders and the toggle still works.
