/**
 * useWarningPolygons — thin selector over the shared DataProvider plus the
 * pure styling/tag helpers used by map and list components.
 *
 * Polygons are derived from the same single `active_alerts` subscription as
 * useAlerts (one query, one realtime channel per page). The alerts-poll edge
 * function resolves NWS zone shapes server-side and stores them in
 * active_alerts.geometry, so the client almost never has to hit
 * api.weather.gov directly anymore.
 */
import { useDataContext } from "@/providers/DataProvider";

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
    params.spcWatchTitle ?? "",
    params.spcPds ?? "",
    Array.isArray(params.tornadoDetection) ? params.tornadoDetection.join(" ") : (params.tornadoDetection ?? ""),
  ];
  return parts.join(" ").toLowerCase();
}

function hasPDS(haystack: string): boolean {
  return /particularly dangerous situation|\bpds\b/.test(haystack);
}

export function getWarningColor(properties: any): string {
  const event = properties?.event as string;
  const haystack = buildHaystack(properties);
  const pds = hasPDS(haystack);

  if (event === "Tornado Warning") {
    if (haystack.includes("tornado emergency")) return "#7B0000";
    if (pds) return "#800080";
  }
  if (event === "Severe Thunderstorm Warning" && pds) return "#8B4513";
  if (event === "Flash Flood Warning") {
    if (haystack.includes("flash flood emergency")) return "#7B3F00";
    if (pds) return "#ADFF2F";
  }

  return WARNING_COLORS[event] ?? "#FFFFFF";
}

export function getWarningTags(properties: any): string[] {
  const tags: string[] = [];
  const haystack = buildHaystack(properties);
  if (hasPDS(haystack)) tags.push("PDS");
  if (haystack.includes("tornado emergency")) tags.push("TORNADO EMERGENCY");
  if (haystack.includes("flash flood emergency")) tags.push("FLASH FLOOD EMERGENCY");
  if (properties.certainty === "Observed") tags.push("OBSERVED");
  if (haystack.includes("considerable")) tags.push("CONSIDERABLE");
  if (haystack.includes("catastrophic")) tags.push("CATASTROPHIC");
  if (haystack.includes("destructive")) tags.push("DESTRUCTIVE");
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
  return useDataContext().polygons;
}
