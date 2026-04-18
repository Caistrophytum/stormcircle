import { RADAR_STATIONS, RadarStation } from "@/config/radarStations";

// Haversine distance in km
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

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
