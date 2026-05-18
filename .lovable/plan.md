# Speed up the mobile radar

Goal: same features, same look, much less work for the phone's GPU/CPU and network. Everything below is a perf-only change — nothing is removed, hidden, or behaviourally altered.

## Where the time is going today

Quick audit of the radar path (`MobileRadar` → `LeafletRadar` → `WarningPolygons` + `RadarStationMarkers` + tile layers):

1. **144 NEXRAD station markers** render as individual SVG `<circle>` elements. On a 3× DPR phone this is one of the slowest things Leaflet can do.
2. **Warning polygons** render as SVG too, and for every polygon we:
   - build a permanent `L.tooltip` object upfront (even though it only shows on hover, which doesn't exist on touch),
   - attach a `mousemove` listener to the map that does a ray-cast point-in-polygon against **every** warning on every pointer move,
   - tear down and rebuild every layer/tooltip whenever the polygons array identity changes (every minute on refresh).
3. **Four stacked tile layers** (dark base + US-states overlay + radar + dark labels) — each fetches its own grid of tiles. The states overlay and labels layer aren't strictly needed for the radar to be readable on a small screen.
4. **Radar tile layer** is recreated from scratch (`L.tileLayer(...)` → `addTo`) on every `tileUrl` change, even when only the product code changes for the same station.
5. **Cache-busted tile URL** triggers a `setUrl` every 60 s — fine, but combined with `updateWhenIdle: false` (Leaflet default) the phone keeps fetching during pan/zoom inertia.
6. **Zone-geometry fetches** in `useWarningPolygons` fire `Promise.all` over every zone URL with no concurrency cap, which on a national alerts day can be dozens of parallel `api.weather.gov` requests competing with tile loads.

## What to change

### 1. Switch Leaflet to canvas rendering on mobile
Add `preferCanvas: true` to the `<MapContainer>` (or pass an explicit `renderer={L.canvas({ padding: 0.5 })}` to the markers/polygons). One canvas draw replaces ~144 SVG nodes + N polygon nodes. This alone is the single biggest win.

### 2. Stop building permanent tooltip objects on touch devices
In `WarningPolygons`, detect `('ontouchstart' in window) && !matchMedia('(hover: hover)').matches` once, and when true:
- skip the `L.tooltip(...)` construction loop entirely,
- skip the `map.on('mousemove', ...)` / `mouseout` registration.

Touch users already get the click-popup path, which is the only interaction they can actually trigger — so behaviour is identical.

### 3. Diff polygons instead of full teardown/rebuild
Rework the polygons effect to key layers by `p.id`:
- add layers for new ids,
- remove layers for ids no longer present,
- leave untouched layers alone.

Today the minute-by-minute refresh destroys and recreates every layer + tooltip, which is what makes the map feel like it "blinks" on slow devices.

### 4. Tile-layer hygiene
On the shared `LeafletRadar` tile layers (basemap, states overlay, radar, labels), set:
- `updateWhenIdle: true` (already implicitly true on touch, but be explicit),
- `keepBuffer: 1` (default 2) to halve off-screen tile retention,
- `updateWhenZooming: false`.

On the mobile-only path (`MobileRadar`), skip the `usstates` overlay tile layer and the `dark_only_labels` overlay tile layer — the labels are unreadable at phone zoom anyway and the radar overlay already implies state context. This removes two full tile grids from the network without changing what the user can do.

### 5. Don't recreate the radar `TileLayer` when only the product changes
In `RadarOverlayLayer`, split the effect: create the layer once per mount, then use `layerRef.current.setUrl(newBustedUrl, false)` whenever either `tileUrl` or `cacheBust` changes. Today a product switch (N0B → N0U) tears the layer down and re-adds it, which causes a visible flash and a full tile re-request storm.

### 6. Throttle the zone-geometry fan-out
In `useWarningPolygons`, replace the bare `Promise.all(zoneJobs)` with a small concurrency limiter (e.g. 4 in-flight at a time). Final result identical; network pressure during the first 2 s of the map mount drops sharply, leaving bandwidth for the radar tiles.

### 7. Use the shared 60 s refresh tick for warnings too
`useWarningPolygons` only refreshes on the realtime `postgres_changes` event, which is fine — no change needed there. But the per-mount `load()` call currently blocks first paint on the alerts query. Move the initial `load()` behind a `requestIdleCallback` (with a 500 ms `setTimeout` fallback) so the radar tiles get the first network slot.

## Files touched

- `src/components/RadarMiniMap.tsx` — add `preferCanvas`, tile-layer options, split radar-layer effect, mobile-aware overlay skipping.
- `src/components/WarningPolygons.tsx` — touch-mode guard, id-diff layer management.
- `src/hooks/useWarningPolygons.ts` — concurrency-limited zone fetch, idle-deferred initial load.
- `src/components/mobile/MobileRadar.tsx` — pass a `mobile` hint (or rely on the touch detection inside `LeafletRadar`) so the states/labels overlays are skipped.

No edge-function, schema, or product-behaviour changes.

## Expected outcome

- First meaningful radar paint on a mid-range Android phone goes from "several seconds of black map" to roughly the time of one basemap + one radar tile round-trip.
- Pan/zoom stays at 60 fps even with a national severe-weather day's worth of warning polygons on screen.
- Battery and data use drop because two redundant tile grids and a per-product layer rebuild stop happening.
