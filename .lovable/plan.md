## Goal

Replace prose-regex hazard detection with SPC's own machine-readable per-hazard outlooks. The summary becomes both more accurate (it matches what SPC officially issued) and cheaper at runtime (no client re-parsing, no per-client fallback fetch to spc.noaa.gov).

## What SPC actually publishes

For every Day 1 outlook, SPC publishes four GeoJSON layers on the same MapServer we already use:

- Layer 1 — Categorical (MRGL/SLGT/ENH/MDT/HIGH) — what we use today
- Layer 2 — Tornado probability polygons (2/5/10/15/30/45/60%) with a `SIGN` flag for hatched (significant)
- Layer 3 — Hail probability polygons (5/15/30/45/60%) + `SIGN`
- Layer 4 — Wind probability polygons (5/15/30/45/60%) + `SIGN`

These are the ground truth. "Significant" is a real, defined SPC concept (hatched ≥10% prob of EF2+/2"+ hail/75+mph wind) — not a word to fish out of prose.

## What changes

### 1. `spc-poll` (edge function)

Fetch all four layers per run (one extra ~50–200 KB fetch each — SPC polygons are small; this is negligible). For each hazard:

- Pick the maximum probability present anywhere
- Note whether any `SIGN=1` polygon exists
- Skip the hazard entirely if no polygons are issued

Build the summary deterministically from those facts plus the existing categorical tier and top states:

```text
"<TierAdjective> severe thunderstorms <verb> across <region> <time>,
 with <hazard list>."
```

Where:
- Tier adjective = MRGL→Isolated, SLGT→Scattered, ENH→Numerous, MDT→Widespread, HIGH→Significant
- Hazard phrase = e.g. "15% tornado risk (significant)", "5% hail risk", "30% wind risk (significant)"
- Hazards omitted if SPC didn't issue that layer

Drop the discussion-regex hazard scoring entirely. Keep the AFD fetch only for the natural-language *timing* phrase ("this afternoon and evening") — that's the one thing the shapefiles don't give us, and it's a benign extraction.

### 2. Database

Add one nullable `hazards jsonb` column to `spc_outlook_state` to hold the structured per-hazard summary:

```json
[
  { "hazard": "tornado", "maxProb": 5, "significant": false },
  { "hazard": "hail", "maxProb": 15, "significant": false },
  { "hazard": "wind", "maxProb": 30, "significant": true }
]
```

Disk impact: a few hundred bytes per outlook, single row (id=1) — effectively zero.

No new tables, no polygon storage. We do NOT persist the hazard geometries — they're only needed transiently to compute max prob + SIGN flag during the poll.

### 3. Bot message payload

Extend the embedded `<!--data:...-->` JSON with `hazards`, drop redundant prose fields the client used to scan. Increment a small schema version field for forward-compat.

### 4. `SystemMessageCard`

Becomes a dumb renderer:
- Read `payload.summary` directly (server-built, deterministic)
- Read `payload.hazards` to render per-hazard chips with proper severity coloring (matches the existing Watch/Warning/Emergency palette: %-low → amber, significant → red)
- Remove the in-component regex hazard scanner, qualifier detector, region detector
- Remove the client fallback `fetch("https://www.spc.noaa.gov/products/outlook/day1otlk.txt")` — kills one network call per render per client
- Older messages without `payload.hazards` still render fine via the existing tier-only fallback already in place

Net: card file shrinks by ~150 lines, no client SPC fetch, no re-parse work.

### 5. Snapshot tests

Add `supabase/functions/spc-poll/__tests__/fixtures/` with three archived outlook bundles:

- `mrgl_only.json` — quiet day (today's case)
- `enh_outbreak.json` — multi-hazard, regional
- `high_outbreak.json` — significant tornado hatched

Each fixture is the raw GeoJSON for all 4 layers + the AFD text, stored as static JSON (~10–30 KB each, ~80 KB total committed to the repo). A Deno test feeds these into the pure summary-building function and asserts the produced sentence. Run via `supabase--test_edge_functions`.

This catches "significant tornadoes on a MRGL day"-class regressions instantly.

## Performance / disk budget

- Edge function: 3 extra GeoJSON fetches per 5-min poll = ~12 extra MB/day egress to SPC. Trivial.
- DB: one `jsonb` column on a 1-row table. Trivial.
- Repo: ~80 KB of test fixtures, one-time.
- Client: removes 1 network fetch + ~200 lines of regex per SPC card render. Net savings.

## Out of scope (per your direction)

- No LLM summarization (#3 from prior discussion).
- No polygon storage / no hazard maps in the UI.
- No changes to categorical polygon rendering on the map.

## Files touched

- `supabase/functions/spc-poll/index.ts` — fetch 4 layers, build deterministic summary
- `supabase/functions/spc-poll/summary.ts` — pure builder, extracted for testability
- `supabase/functions/spc-poll/__tests__/summary_test.ts` — new
- `supabase/functions/spc-poll/__tests__/fixtures/*.json` — new (3 files)
- DB migration — add `hazards jsonb` to `spc_outlook_state`
- `src/components/SystemMessageCard.tsx` — strip regex, render `payload.summary` + `payload.hazards` chips
- Run `spc-poll?force=1` once after deploy so the current row picks up the new format
