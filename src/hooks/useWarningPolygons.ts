import { useEffect, useState } from "react";

/** Color map for NWS event types. Unknown types fall back to #FFFFFF. */
export const WARNING_COLORS: Record<string, string> = {
  // Tornado
  "Tornado Warning": "#FF0000",
  "Tornado Watch": "#FF69B4",
  // Thunderstorm
  "Severe Thunderstorm Warning": "#FFA500",
  "Severe Thunderstorm Watch": "#FFFF00",
  // Flood
  "Flash Flood Warning": "#00FF00",
  "Flash Flood Watch": "#2E8B57",
  "Flood Warning": "#00FF00",
  "Flood Watch": "#2E8B57",
  "Flood Advisory": "#00FA9A",
  // Winter
  "Winter Storm Warning": "#FF69B4",
  "Winter Storm Watch": "#4169E1",
  "Blizzard Warning": "#FF4500",
  "Ice Storm Warning": "#8B008B",
  "Winter Weather Advisory": "#7B68EE",
  // Wind
  "High Wind Warning": "#DAA520",
  "High Wind Watch": "#B8860B",
  "Wind Advisory": "#D2B48C",
  // Marine
  "Special Marine Warning": "#FFA500",
  // Heat/Cold
  "Excessive Heat Warning": "#C71585",
  "Excessive Heat Watch": "#FF4500",
  "Heat Advisory": "#FF7F50",
  "Wind Chill Warning": "#B0C4DE",
  "Wind Chill Watch": "#5F9EA0",
  "Wind Chill Advisory": "#AFEEEE",
  // Fog/Visibility
  "Dense Fog Advisory": "#708090",
  "Freeze Warning": "#483D8B",
  "Frost Advisory": "#6495ED",
};

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
  parameters: Record<string, any>;
  flash: boolean;
  color: string;
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
              parameters: props.parameters ?? {},
              flash: shouldFlash(props),
              color: getWarningColor(props),
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
