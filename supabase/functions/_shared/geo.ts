// Shared point-in-polygon helpers for notification / outlook functions.
// Coordinates are [lon, lat]; handles GeoJSON Polygon and MultiPolygon.

export interface Geom {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

export function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const hit =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function pointInGeom(lon: number, lat: number, geom: Geom | null): boolean {
  if (!geom || !geom.coordinates) return false;
  const polys =
    geom.type === "Polygon"
      ? [geom.coordinates as number[][][]]
      : (geom.coordinates as number[][][][]);
  for (const rings of polys) {
    if (!rings.length || !pointInRing(lon, lat, rings[0])) continue;
    let inHole = false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lon, lat, rings[i])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}
