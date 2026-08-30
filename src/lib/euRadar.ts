/**
 * European radar (EUMETNET OPERA via MeteoGate) - PLACEHOLDER.
 *
 * Landing endpoint: https://api.meteogate.eu/eu-eumetnet-weather-radar
 *
 * Status: not wired into the UI yet. The NEXRAD tile pipeline in
 * `useRadar.ts` is CONUS-only; this module is the seam where a European
 * composite layer will plug in once the MeteoGate collection/coverage
 * details are confirmed (auth requirements, tile vs. coverage-data output,
 * update cadence).
 *
 * TODO before going live:
 *  1. GET `${EU_RADAR_BASE}/collections` and pick the reflectivity collection.
 *  2. Decide delivery: OGC EDR coverage (needs client-side rendering) vs. a
 *     WMS/tile endpoint that Leaflet can consume directly.
 *  3. Add an auth token secret if the collection is not public.
 *  4. Fall back to NEXRAD when the selected city is inside the US.
 */

/** MeteoGate EUMETNET weather radar service root. */
export const EU_RADAR_BASE = "https://api.meteogate.eu/eu-eumetnet-weather-radar";

/** Rough bounding box of the OPERA composite (lon/lat). */
export const EU_RADAR_BBOX = {
  minLon: -31.5,
  minLat: 31.7,
  maxLon: 45.0,
  maxLat: 72.0,
};

/** True when a coordinate falls inside the European radar coverage area. */
export function isInEuRadarCoverage(lat: number, lon: number): boolean {
  return (
    lat >= EU_RADAR_BBOX.minLat &&
    lat <= EU_RADAR_BBOX.maxLat &&
    lon >= EU_RADAR_BBOX.minLon &&
    lon <= EU_RADAR_BBOX.maxLon
  );
}

/**
 * Placeholder tile URL builder. Returns null until the real MeteoGate
 * radar endpoint shape is confirmed, so callers can safely no-op.
 */
export function euRadarTileUrl(): string | null {
  return null;
}

/** Discovery helper: lists the collections exposed by the service. */
export async function listEuRadarCollections(): Promise<unknown> {
  const res = await fetch(`${EU_RADAR_BASE}/collections?f=json`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`MeteoGate radar ${res.status}`);
  return res.json();
}
