/**
 * Geographic helpers used by the radar UI to pick the closest NEXRAD
 * station to the user's chosen point.
 */
import { RADAR_STATIONS, RadarStation } from "@/config/radarStations";

/**
 * Great-circle distance between two lat/lon points using the haversine
 * formula. Returns kilometers. Accurate enough for "nearest station"
 * selection (sub-km error is irrelevant when stations are 100s of km apart).
 *
 * R = mean Earth radius in km.
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Linear scan of RADAR_STATIONS to find the one closest to (lat, lon).
 * The list is small (~150 entries) so an O(n) scan is plenty fast and
 * avoids the complexity of a spatial index.
 */
export function findNearestStation(lat: number, lon: number): { station: RadarStation; distanceKm: number } {
  let best = RADAR_STATIONS[0];
  let bestD = haversineKm(lat, lon, best.lat, best.lon);
  for (let i = 1; i < RADAR_STATIONS.length; i++) {
    const s = RADAR_STATIONS[i];
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { station: best, distanceKm: bestD };
}
