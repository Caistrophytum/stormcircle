import { useEffect, useState } from "react";

export const WARNING_COLORS: Record<string, string> = {
  "Tornado Warning": "#FF0000",
  "Severe Thunderstorm Warning": "#FFA500",
  "Flash Flood Warning": "#00FF00",
  "Tornado Watch": "#FF69B4",
  "Severe Thunderstorm Watch": "#FFFF00",
};

const ALLOWED_EVENTS = new Set(Object.keys(WARNING_COLORS));

export interface WarningPolygon {
  id: string;
  event: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

export interface WarningPolygonsData {
  polygons: WarningPolygon[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const REFRESH_INTERVAL_MS = 60_000; // 1 minute

export function useWarningPolygons(): WarningPolygonsData {
  const [data, setData] = useState<WarningPolygonsData>({
    polygons: [],
    loading: true,
    error: null,
    lastUpdated: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchPolygons() {
      try {
        const res = await fetch(
          "https://api.weather.gov/alerts/active?status=actual&message_type=alert",
          { headers: { "User-Agent": "MyWeatherApp/1.0" } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const features: any[] = Array.isArray(json?.features) ? json.features : [];

        const polygons: WarningPolygon[] = features
          .filter(
            (f) =>
              f?.geometry != null &&
              (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") &&
              ALLOWED_EVENTS.has(f?.properties?.event),
          )
          .map((f) => ({
            id: String(f.properties.id ?? f.id),
            event: String(f.properties.event),
            geometry: f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
          }));

        if (!cancelled) {
          setData({
            polygons,
            loading: false,
            error: null,
            lastUpdated: new Date(),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setData((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to fetch warnings",
          }));
        }
      }
    }

    fetchPolygons();
    const intervalId = setInterval(fetchPolygons, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return data;
}
