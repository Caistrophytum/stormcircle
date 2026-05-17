
## Goal

All weather data — SPC convective outlooks, NHC tropical cyclones + ENSO, NWS active warnings/polygons — is fetched on a server-side schedule (pg_cron + edge functions), persisted to Supabase, and pushed to clients via Postgres Realtime. Client hooks become thin subscribers. Bots post messages from the server, not the browser.

This eliminates the "no one had the tab open, so no one polled" problem for every current and future bot.

## Architecture

```text
                    pg_cron (every 1–5 min)
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │  Edge Functions (scheduled, no auth)    │
        │  • spc-poll       (every 5 min)         │
        │  • nhc-poll       (every 5 min)         │
        │  • alerts-poll    (every 1 min)         │
        │  • enso-poll      (every 6 h)           │
        └─────────────────────────────────────────┘
                          │ fetch NOAA, parse, upsert
                          ▼
        ┌─────────────────────────────────────────┐
        │  New Supabase tables (source of truth)  │
        │  • spc_outlook_state                    │
        │  • nhc_storms                           │
        │  • active_alerts                        │
        │  • enso_state                           │
        │  + messages (bot posts written here)    │
        └─────────────────────────────────────────┘
                          │ Postgres Realtime
                          ▼
                    Client hooks (read-only)
```

## Bots in scope

1. **SPC Bot** — Day 1 Convective Outlook + reverse-geocoded counties + timing line.
2. **Hurricane Bot** — NHC CurrentStorms, advisory updates, season status, ENSO line.
3. **NWS Warnings/Polygons** — active alerts feed for the live map (not a chat bot, but same data-collection pattern).
4. **Pattern for future bots** — documented so adding a new server-polled feed is a copy/paste exercise.

## Implementation steps

### 1. Database

- `spc_outlook_state` — single-row table (id=1) holding `issue`, `groups jsonb`, `timing`, `valid_window jsonb`, `updated_at`. Drives the SPC bot message.
- `nhc_storms` — one row per active storm id with full last advisory snapshot; soft-deleted when NHC drops the storm.
- `active_alerts` — one row per NWS alert id with `geometry jsonb`, `properties jsonb`, `expires_at`. Cron deletes expired rows.
- `enso_state` — single-row, latest weekly Niño 3.4 anomaly + phase.
- Realtime publication added for all four tables.
- RLS: public read; only service role writes.

### 2. Edge functions (all `verify_jwt = false`, called by pg_cron with the anon key)

- `spc-poll` — fetches SPC GeoJSON + discussion text, reverse-geocodes new polygons, upserts `spc_outlook_state`, inserts/replaces the SPC bot message in `messages` when ISSUE changes.
- `nhc-poll` — fetches `CurrentStorms.json`, diffs against `nhc_storms`, posts advisory + danger messages to `messages` for changed storms.
- `alerts-poll` — fetches `api.weather.gov/alerts/active`, upserts `active_alerts`, removes expired rows. Map polygons are read from this table by clients.
- `enso-poll` — fetches CPC weekly SST file, updates `enso_state`. Hurricane season-status message reads from this table.

### 3. pg_cron schedules

- `spc-poll`: every 5 minutes
- `nhc-poll`: every 5 minutes
- `alerts-poll`: every 1 minute
- `enso-poll`: every 6 hours

### 4. Client hook refactor

- `useSPCOutlook` → subscribes to `spc_outlook_state` via Realtime. No more browser fetch, no reverse-geocoding loop.
- `useHurricaneData` → subscribes to `nhc_storms`. Existing `Storm` type populated from the row.
- `useHurricaneBot` → deleted (server handles all posting). Replaced by hurricane logic inside `nhc-poll` + `enso-poll`.
- `useWarningPolygons` → subscribes to `active_alerts`. Same shape returned, no NWS API calls in browser.
- Module-level `started` guards and visibility listeners removed — no longer needed.

### 5. Pattern doc

Short README at `supabase/functions/_bots/README.md` describing how to add a new server-polled bot: create table → create poll function → add pg_cron entry → expose realtime → write client subscriber.

## Out of scope (this pass)

- Reverse-geocoding cache table (nice-to-have; can be added if NWS rate-limits the cron).
- Backfilling historical data — only current state is persisted.
- Migrating user-generated messages or anything not bot-related.

## Technical notes

- pg_cron entries are inserted via the **insert tool** (not migration), because they contain the project's anon key URL.
- All four edge functions deploy with `verify_jwt = false`. The cron call passes the anon key in the `apikey` header; functions also accept service-role for manual triggering.
- Each cron function uses a Postgres advisory lock (or a `last_run_at` column on the state table) to avoid overlapping runs if a fetch is slow.
- Bot message inserts use the existing reserved UUIDs (`…0000` for SPC, `…0001` for Hurricane); the delete-then-insert pattern is preserved so Realtime subscribers see fresh INSERT events.
- Failure handling: each poll function logs to its own table-level `*_state.last_error` column so the UI can show a "data feed degraded" indicator if needed.

## Risks

- NWS `/alerts/active` returns large payloads during major outbreaks (1 MB+). The cron function streams + upserts in batches; the table stores only the fields the map renders.
- NWS rate limits the reverse-geocoding endpoint. SPC bot will rate-limit (500ms between calls, same as today) but inside the function, not the browser.
- pg_net HTTP calls from cron must succeed within the function's 60s wall clock; SPC reverse-geocoding of a large multi-state outlook may exceed this. Mitigation: spc-poll splits work — first run records the new ISSUE and bare polygons; second run fills counties.
