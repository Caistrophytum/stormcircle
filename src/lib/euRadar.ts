/**
 * European radar composite.
 *
 * The EUMETNET OPERA composite is exposed by MeteoGate
 * (https://api.meteogate.eu/eu-eumetnet-weather-radar) only as OGC EDR
 * CoverageJSON point/area queries - there is no tiled imagery endpoint, so a
 * Leaflet raster overlay cannot consume it directly. For the map layer we use
 * RainViewer's public radar tile cache, which mosaics the European national
 * radar networks (OPERA members) and needs no API key.
 *
 * NEXRAD stays the source inside the US (higher resolution, per-station
 * products); this module only powers the non-US / European view.
 */

/** MeteoGate EUMETNET weather radar service root (metadata / EDR queries). */
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

const RAINVIEWER_INDEX = "https://api.rainviewer.com/public/weather-maps.json";

export interface EuRadarFrame {
  /** Unix seconds of the frame. */
  time: number;
  /** Tile host, e.g. https://tilecache.rainviewer.com */
  host: string;
  /** Frame path, e.g. /v2/radar/ffa6dbf57c1b */
  path: string;
}

interface RainViewerIndex {
  host?: string;
  radar?: {
    past?: { time: number; path: string }[];
    nowcast?: { time: number; path: string }[];
  };
}

/**
 * Fetches the newest available radar frame. Returns null on any failure so
 * callers can fall back to "no overlay" instead of breaking the map.
 */
export async function fetchLatestEuRadarFrame(): Promise<EuRadarFrame | null> {
  try {
    const res = await fetch(RAINVIEWER_INDEX, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as RainViewerIndex;
    const past = json.radar?.past ?? [];
    const last = past[past.length - 1];
    if (!last) return null;
    return {
      time: last.time,
      host: json.host ?? "https://tilecache.rainviewer.com",
      path: last.path,
    };
  } catch {
    return null;
  }
}

/**
 * Builds a Leaflet tile URL template for a radar frame.
 * Colour scheme 6 (NEXRAD Level III) with smoothing, no snow mask, so the
 * European composite matches the US NEXRAD palette.
 */
export function euRadarTileUrl(frame: EuRadarFrame | null): string | null {
  if (!frame) return null;
  return `${frame.host}${frame.path}/256/{z}/{x}/{y}/6/1_1.png`;
}
