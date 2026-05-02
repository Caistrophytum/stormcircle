## Why it feels slow

Two distinct bottlenecks were found:

1. **Initial page load** is dominated by the weather background images. The four JPGs in `src/assets/` total **~5.4 MB** (`weather-rainy.jpg` alone is 2.3 MB, `weather-overcast.jpg` is 1.9 MB). They are all `import`-ed eagerly in `TacticalMap.tsx`, so Vite bundles all four into the initial chunk — even though only one is shown at a time.
2. **Radar mini-map "buffering"** happens because the small circular preview mounts a full Leaflet `MapContainer` with:
   - 3 base/label tile layers from CARTO + a US-states overlay (4 sets of tiles fetched on every render),
   - **144 `CircleMarker`s with permanent tooltips** (one per NEXRAD station) drawn at zoom 4 — most of which overlap into illegible clusters and are pure DOM/SVG overhead,
   - a NEXRAD radar tile layer that re-creates itself every time `cacheBust` ticks (every 60 s) instead of swapping the URL on the existing layer.
   
   On top of that, the mini-map and the expanded map are two separate `MapContainer` instances, so opening the expanded view re-downloads every tile from scratch.

## Plan

### 1. Shrink and lazy-load the weather backgrounds
- Re-encode the four JPGs to ~1600 px wide, quality ~70, and add WebP variants. Target: each file under ~150 KB (≈95% smaller than today).
- Stop eagerly importing all four. Build a small map of URLs (`new URL('../assets/weather-*.webp', import.meta.url)`) and only set the `<img src>` for the currently active condition; preload the next-most-likely one (`sunny`) idly.
- Add `loading="eager"` + `fetchpriority="high"` to the active background and `decoding="async"` so it doesn't block paint.

### 2. Code-split the radar map
- Wrap `RadarMiniMap` (and its Leaflet imports) in `React.lazy` + `Suspense` with a lightweight placeholder (the existing circular glass panel + a small spinner). Leaflet + react-leaflet + the leaflet CSS are ~150 KB gzipped and currently sit in the main bundle.
- Same treatment for `WarningPolygons` (only needed once the map mounts).

### 3. Make the mini-map cheap
- In the **collapsed** (circular) view, render only the basemap + the radar tile + the selected station marker. Skip the 144-marker layer and the labels tile (`dark_only_labels`) — they're invisible at that size anyway.
- Render the full station marker set + labels layer only when `expanded` is true.
- Replace the `useEffect` that recreates `L.tileLayer` on every `cacheBust` with a ref that calls `radarLayer.setUrl(busted)` in place. Avoids a full tile redownload every minute.
- Memoize `RadarStationMarkers` and stop passing inline arrow functions in `eventHandlers` so React-Leaflet can skip re-renders on parent state changes.

### 4. Share one map instance between collapsed and expanded
- Hoist the `MapContainer` into a single mounted instance and toggle its container size/interactivity via CSS + `map.invalidateSize()` on expand. Eliminates the second tile fetch storm when the user opens the radar.

### 5. Small wins
- Add `<link rel="preconnect">` in `index.html` for `mesonet.agron.iastate.edu` and `basemaps.cartocdn.com` so TLS handshakes start before React mounts.
- Add `loading="lazy"` to the three non-active weather backgrounds if any are kept in the DOM.
- Memoize `soundingNodes` dependencies in `TacticalMap` so they don't recompute every weather poll (15 s cadence currently triggers a full re-render of the map subtree).

### Out of scope
- No backend changes; tile providers stay the same.
- No visual redesign — the circular mini-map, expanded panel, and station-picking UX stay identical.

### Expected impact
- Initial JS+image payload: from ~5.5 MB to **<700 KB** on first paint.
- Radar mini-map mount time: from "buffer for several seconds" to roughly the time of one tile request (~200–400 ms on a warm CDN).
- Expanding the radar: near-instant instead of re-fetching every tile.
