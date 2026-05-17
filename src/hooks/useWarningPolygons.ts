import { useEffect, useState } from "react";
import { useRefreshTick } from "./useRefreshTick";

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
  // Statements
  "Special Weather Statement": "#800080",
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
 * (Tornado Emergency, PDS, Flash Flood Emergency).
 *
 * PDS overrides apply to ALL Tornado / Severe Thunderstorm / Flash Flood
 * Warnings regardless of whether they are radar-indicated or observed.
 */
export function getWarningColor(properties: any): string {
  const event = properties?.event as string;
  const haystack = buildHaystack(properties);
  const pds = hasPDS(haystack);

  if (event === "Tornado Warning") {
    if (haystack.includes("tornado emergency")) return "#7B0000";
    if (pds) return "#800080"; // purple
  }
  if (event === "Severe Thunderstorm Warning" && pds) {
    return "#8B4513"; // brown
  }
  if (event === "Flash Flood Warning") {
    if (haystack.includes("flash flood emergency")) return "#7B3F00";
    if (pds) return "#ADFF2F"; // yellow-green
  }

  return WARNING_COLORS[event] ?? "#FFFFFF";
}

export function getWarningTags(properties: any): string[] {
  const tags: string[] = [];
  const desc = (properties.description ?? "").toLowerCase();

  if (desc.includes("particularly dangerous situation")) tags.push("PDS");
  if (desc.includes("tornado emergency")) tags.push("TORNADO EMERGENCY");
  if (desc.includes("flash flood emergency")) tags.push("FLASH FLOOD EMERGENCY");
  if (properties.certainty === "Observed") tags.push("OBSERVED");
  if (desc.includes("considerable")) tags.push("CONSIDERABLE");
  if (desc.includes("catastrophic")) tags.push("CATASTROPHIC");

  return tags;
}

export function getExpiresLabel(isoString: string): string {
  if (!isoString) return "Unknown";
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `Expires in ${mins} minute${mins !== 1 ? "s" : ""}`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `Expires in ${hrs}h ${rem}m`;
}

export interface WarningPolygon {
  id: string;
  event: string;
  areaDesc: string;
  expires: string;
  description: string;
  headline: string;
  severity: string;
  certainty: string;
  urgency: string;
  parameters: Record<string, any>;
  
  color: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

export interface WarningPolygonsData {
  polygons: WarningPolygon[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useWarningPolygons(): WarningPolygonsData {
  const [data, setData] = useState<WarningPolygonsData>({
    polygons: [],
    loading: true,
    error: null,
    lastUpdated: null,
  });

  // Subscribe to the shared 60s refresh clock so warning fetches fire in
  // lockstep with radar tile refreshes and other 1-minute data sources.
  const tick = useRefreshTick();

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

        // 1) Features that already carry a polygon — use directly.
        const inlinePolygons: WarningPolygon[] = features
          .filter(
            (f) =>
              f?.geometry != null &&
              (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
          )
          .map((f) => toWarningPolygon(f, f.geometry));

        // 2) Features without inline geometry — resolve their affectedZones
        //    (e.g. land-zone advisories: Winter Weather, Wind, Red Flag, Flood,
        //    Special Weather Statement, etc.) into MultiPolygon geometry.
        //    These were previously dropped, which is why some polygons looked
        //    "missing" on the map.
        const zoneFeatures = features.filter(
          (f) =>
            (!f?.geometry ||
              (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon")) &&
            Array.isArray(f?.properties?.affectedZones) &&
            f.properties.affectedZones.length > 0,
        );

        const zonePolygons = await Promise.all(
          zoneFeatures.map(async (f) => {
            const urls: string[] = f.properties.affectedZones;
            const geom = await resolveZonesGeometry(urls);
            if (!geom) return null;
            return toWarningPolygon(f, geom);
          }),
        ).then((arr) => arr.filter((p): p is WarningPolygon => p !== null));

        const polygons: WarningPolygon[] = [...inlinePolygons, ...zonePolygons];

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

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return data;
}
