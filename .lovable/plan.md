# Radar focus by home region, and drop the EU site circles

## Goal
Make the radar behave differently by region, decided from the user's location:

- US location: pan to the nearest NEXRAD site and show its per-site scan products, as today.
- Europe/Israel location: just show the European composite centred on the location, with no radar-site circles on the map.

The European site circles added earlier are removed: they are redundant since the composite is a single mosaic and the sites are not individually selectable products.

## Behaviour details

Focus source stays the same as now: selected city if there is one, else the saved hometown, else Washington DC.

- Focus in the US: nearest NEXRAD station, station distance readout, scan products enabled, NEXRAD markers shown.
- Focus in European/Israeli coverage: European composite tiles centred on the focus itself (not on a radar site), no nearest-site readout, no station markers, scan products disabled with the existing "NEXRAD only" note.
- Focus elsewhere: current fallback keeps working (hometown if US, otherwise Washington DC).

## Technical changes

- `src/hooks/useRadar.ts`: in EU mode stop calling `findNearestEuStation` and stop setting `selectedStation` / `stationDistanceKm` to an OPERA site. Instead expose the focus point so the map can centre on it. Keep `euMode`, `euFrame`, and `tileUrl` unchanged. Drop the EU branch in `selectStationByMarker` since EU markers no longer exist.
- `src/components/RadarMiniMap.tsx`: in `LeafletRadar`, render `RadarStationMarkers` only when not in EU mode; remove the `euMode` branch and `EU_RADAR_STATIONS` import from the markers component. Centre the map on the focus coordinates when in EU mode (station is null there).
- `src/components/RadarControls.tsx`: hide the "Nearest EU Radar" block in EU mode; keep the composite note and the disabled product tiles.
- `src/components/desktop/tabs/RadarReportsTab.tsx` and `src/components/mobile/MobileRadar.tsx`: keep passing `euMode`; adjust any nearest-station text that assumes a station exists in EU mode.
- `src/config/euRadarStations.ts`: no longer used for map markers. Keep only the coverage helper if something still needs it, otherwise delete the file.

## Verification
Typecheck plus a browser check: a US city keeps NEXRAD markers and a station readout, a European/Israeli city shows composite echoes with no circles and no nearest-site block.
