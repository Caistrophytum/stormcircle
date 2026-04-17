import { useEffect, useState } from "react";

/** Legacy color map kept for any existing imports. Prefer getWarningColor(). */
export const WARNING_COLORS: Record<string, string> = {
  "Tornado Warning": "#FF0000",
  "Severe Thunderstorm Warning": "#FFA500",
  "Flash Flood Warning": "#00FF00",
  "Tornado Watch": "#FF69B4",
  "Severe Thunderstorm Watch": "#FFFF00",
};

const ALLOWED_EVENTS = new Set([
  "Tornado Warning",
  "Severe Thunderstorm Warning",
  "Flash Flood Warning",
  "Tornado Watch",
  "Severe Thunderstorm Watch",
]);

/**
 * Pull a flat lowercase haystack of every place NWS hides damage tags / PDS
 * markers: description, headline, NWSheadline, and the parameters object.
 */
function buildHaystack(properties: any): string {
  const params = properties?.parameters ?? {};
  const parts: string[] = [
    properties?.description ?? "",
    properties?.headline ?? "",
    properties?.event ?? "",
    Array.isArray(params.NWSheadline) ? params.NWSheadline.join(" ") : (params.NWSheadline ?? ""),
    params.tornadoDamageThreatTag ?? "",
    params.thunderstormDamageThreatTag ?? "",
    params.flashFloodDamageThreatTag ?? "",
    Array.isArray(params.tornadoDetection) ? params.tornadoDetection.join(" ") : (params.tornadoDetection ?? ""),
  ];
  return parts.join(" ").toLowerCase();
}

function hasPDS(haystack: string): boolean {
  return /particularly dangerous situation|\bpds\b/.test(haystack);
}

/**
 * Color a warning polygon based on event type AND special damage-tag keywords
 * inside the description text (Tornado Emergency, PDS, Flash Flood Emergency).
 */
export function getWarningColor(properties: any): string {
  const event = properties?.event as string;
  const haystack = buildHaystack(properties);

  if (event === "Tornado Warning") {
    if (haystack.includes("tornado emergency")) return "#7B0000";
    if (hasPDS(haystack)) return "#FF00FF";
    return "#FF0000";
  }
  if (event === "Severe Thunderstorm Warning") {
    if (hasPDS(haystack)) return "#FF6600";
    return "#FFA500";
  }
  if (event === "Flash Flood Warning") {
    if (haystack.includes("flash flood emergency")) return "#7B3F00";
    return "#00FF00";
  }
  if (event === "Tornado Watch") return "#FF69B4";
  if (event === "Severe Thunderstorm Watch") return "#FFFF00";
  return "#FFFFFF";
}

/**
 * Returns true if the warning is high-severity enough to warrant a flashing
 * outline — Emergencies, PDS, Considerable/Destructive/Catastrophic tags.
 */
export function shouldFlash(properties: any): boolean {
  const haystack = buildHaystack(properties);
  return (
    haystack.includes("tornado emergency") ||
    haystack.includes("flash flood emergency") ||
    hasPDS(haystack) ||
    haystack.includes("considerable") ||
    haystack.includes("destructive") ||
    haystack.includes("catastrophic")
  );
}

export interface WarningPolygon {
  id: string;
  event: string;
  description: string;
  headline: string;
  flash: boolean;
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
          .map((f) => {
            const props = f.properties ?? {};
            return {
              id: String(props.id ?? f.id),
              event: String(props.event),
              description: String(props.description ?? ""),
              headline: String(props.headline ?? ""),
              flash: shouldFlash(props),
              geometry: f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
            };
          });

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
