# StormCircle performance and reliability audit

## Database / cloud
- [ ] D1 alerts-poll rewrites all ~520 alert rows every minute (574s total DB time, ~6MB geometry writes/min, ~520 realtime events/min to every tab). Add content hash, upsert only changed rows.
- [ ] D2 Browser re-downloads 4.1MB of alert geometry every 60s per tab. Make the polygon fetch incremental.
- [ ] D3 notify-dispatch pulls every alert with geometry every 5 min. Filter expired rows in SQL.
- [ ] D4 Missing indexes on frequently filtered columns.

## Frontend
- [ ] F1 Single monolithic DataProvider context: any alert/polygon/presence change re-renders every consumer. Split into per-domain contexts.
- [ ] F2 One-second countdown intervals re-render the whole mobile main screen and the desktop metrics tab. Extract into isolated components.
- [ ] F3 No memoization anywhere. Memoize heavy leaf components.
- [ ] F4 Five hooks hit Open-Meteo separately for the same city. Add shared dedupe + TTL cache.
- [ ] F5 Oversized background images (636KB of JPEGs).
