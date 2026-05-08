## Goal

Extend the red home-city bar so it also shows the distance to the nearest "most dangerous" active warning polygon, and auto-scroll the bar horizontally when text overflows.

## Behavior

When a signed-in user has a home city set, the bar text becomes:

```
Now in your home city of [city]: [SPC risk]. Nearest [event]: [X] mi away.
```

If no qualifying polygon exists anywhere in the active feed, the trailing sentence is omitted (bar still shows the SPC risk part). The "no hometown" and "signed out" states are unchanged.

If the rendered text is wider than the bar, it auto-scrolls horizontally as a continuous marquee. If it fits, no animation runs.

## What counts as "most dangerous"

Rank polygons by event severity (highest first). Within the highest tier present in the feed, pick the polygon whose nearest edge is closest to the home city.

Tiering (top wins):
1. Tornado Emergency
2. PDS Tornado Warning
3. Tornado Warning
4. Flash Flood Emergency
5. PDS Severe Thunderstorm Warning
6. Severe Thunderstorm Warning
7. Flash Flood Warning
8. Other Warnings (any "...Warning" event)

Watches/advisories are ignored — bar only highlights warning-tier hazards.

## Distance

Haversine distance from the home city's lat/lon to the nearest vertex of the polygon's outer ring(s). Display in miles when the user's unit system is imperial, kilometres when metric, rounded to the nearest whole unit (or 1 decimal under 10).

## Implementation outline

### `src/hooks/useHomeCityRisk.ts`
- Also expose the resolved `coords` (`{ lat, lon } | null`) alongside `risk` / `loading`. Keep current SPC logic intact.

### New helper inside `TacticalMap.tsx` (or small util in `src/lib/`)
- `rankPolygon(p)` returns a numeric tier from the list above, or `null` to exclude.
- `nearestVertexDistanceKm(coords, geometry)` walks the polygon/multipolygon outer rings using haversine.

### `src/components/TacticalMap.tsx`
- Pull `useWarningPolygons()` and `useUnitSystem()` (already imported).
- Compute `nearestDanger` with `useMemo` over polygons + home coords: filter to ranked polygons, group by highest tier present, pick min distance.
- Build the bar text in one string. Append `"Nearest <event>: <X> <unit> away."` when available.
- Replace the current single `<span>` with a marquee container:
  - Outer div: `overflow-hidden`, full bar width.
  - Inner flex with the text rendered twice back-to-back (for seamless loop), animated with a CSS keyframe `translateX(0) → translateX(-50%)`.
  - Use a `ResizeObserver` (or measure on mount + on text change) to compare `scrollWidth` vs `clientWidth`; toggle a `data-scroll` attribute that enables/disables the animation. When not overflowing, render a single span with `truncate` removed so full text shows.
  - Animation duration scales with text length (e.g. `text.length * 0.18s`, min 12s) so longer text scrolls at a steady speed.

### `src/index.css`
- Add a `@keyframes marquee` (0 → -50% translateX) and a `.animate-marquee` utility class referencing it. Pause on hover for accessibility.

## Notes / trade-offs

- Distance uses nearest *vertex* rather than nearest *edge* — vertex is sufficient at NWS polygon resolution (typically <5 km between vertices) and avoids segment-projection math.
- `useWarningPolygons` already refreshes every 60s via the shared tick, so the bar updates without extra plumbing.
- Marquee uses pure CSS transform — no JS animation loop, no layout thrash.
- No backend or schema changes.