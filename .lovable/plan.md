# Current Location Hazards Block

Add a new block that lists every active hazard (warning, watch, advisory, statement, emergency) whose polygon contains the user's saved home city. Block appears below the existing home-city risk strip on both desktop (`TacticalMap`) and mobile (`MobileMain`). Hidden entirely when there are no matching hazards or no home city.

## Visual

- Transparent background (no fill).
- Each hazard rendered as its own row/chip with:
  - 1px outline in the hazard's polygon color (`getWarningColor(p)`)
  - Event name + short area text colored the same
  - Tiny "Expires in …" label in muted foreground
- Stacked vertically, mono font, matches command-deck aesthetic.

## Data

- Source: `useWarningPolygons()` (already loaded in both `TacticalMap` and `MobileMain`).
- Coords: `useHomeCityRisk(profile.location).coords`.
- Filter: keep polygons whose geometry contains `[lon, lat]` using a point-in-polygon test (ray cast over rings, handles `Polygon` + `MultiPolygon`). Extract this helper into `src/lib/pointInPolygon.ts` so both desktop and mobile (and the existing nearest-danger code) can share it.
- Color: `getWarningColor(p)` from `useWarningPolygons`.
- Sort: by `rankWarning` (most dangerous first), then by soonest expiry.

## New component

`src/components/CurrentLocationHazards.tsx`
- Props: `polygons: WarningPolygon[]`, `coords: {lat,lon} | null`, `cityLabel: string | null`.
- Returns `null` when no coords or zero matches.
- Renders a small header "CURRENT HAZARDS — {city}" then the colored chip list.
- Uses `getExpiresLabel` from `useWarningPolygons` for expiry text.

## Integration

- `src/components/TacticalMap.tsx`: render `<CurrentLocationHazards />` right under the risk strip (around line 454), positioned with the same `left:` offset as the strip, stacked above it via `bottom`. Keep it within the overlay scale group.
- `src/components/mobile/MobileMain.tsx`: render it directly below the hometown news bar (around line 429), full-width inside the existing vertical stack.

## Technical notes

- No backend changes; purely client-side filtering of data already in `DataProvider`.
- No new dependencies.
- Point-in-polygon helper is pure and unit-test friendly; no test added unless requested.
- Respects existing `IS_TOUCH_ONLY` / scale logic; component itself is layout-agnostic.
