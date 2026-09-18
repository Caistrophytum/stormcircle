# StormCircle performance and reliability audit

All items below are implemented and verified.

## Database / cloud
- [x] D1 alerts-poll rewrote every alert row every minute. Added a content hash; only changed rows are written. Verified: 0 of 226 rows rewritten in a quiet minute.
- [x] D2 Browser re-downloaded ~4MB of map shapes every 60s. Now fetches a tiny fingerprint list and pulls shapes only for new or changed alerts. Verified in a live 80 second run.
- [x] D3 notify-dispatch now filters expired alerts in SQL instead of loading the whole table every 5 minutes.
- [x] D4 Added an index for the trend bar query. Restored a dead expired-row cleanup branch in alerts-poll.

## Frontend
- [x] F1 Split the single shared data context into six per-domain contexts.
- [x] F2 Moved the one-second countdown into isolated memoized widgets.
- [x] F3 Memoized the main map panel.
- [x] F4 Added a shared TTL cache and in-flight dedupe for Open-Meteo calls.
- [x] F5 Recompressed background images and app icons (roughly 900KB saved).

## Known remaining risks
- zone_geom_cache is the largest table (~41MB). A 3-day vacuum job exists; not changed.
- alerts-poll defers ~250 zone shape lookups per run by design (CPU budget).
- No React.memo on the large mobile and chat components; the context split removed the main re-render driver, so this was left alone rather than risk behaviour changes.
