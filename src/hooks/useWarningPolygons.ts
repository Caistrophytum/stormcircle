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

/**
 * Official NWS product → display color mapping. Mirrors the canonical
 * WarningColorTable published by the NWS so polygons, list rows, and
 * legends stay consistent with broadcast/SPC conventions.
 */
export const WARNING_COLORS: Record<string, string> = {
  // Convective
  "Tornado Warning": "#FF0000",
  "Tornado Watch": "#FFFF00",
  "Severe Thunderstorm Warning": "#FFA500",
  "Severe Thunderstorm Watch": "#DB7093",
  "Severe Weather Statement": "#00FFFF",
  "Special Marine Warning": "#DB7093",
  // Flood
  "Flash Flood Warning": "#8B0000",
  "Flash Flood Watch": "#32CD32",
  "Flash Flood Statement": "#9ACD32",
  "Flood Warning": "#00FF00",
  "Flood Watch": "#2E8B57",
  "Flood Statement": "#00FF7F",
  "Flood Advisory": "#00FF7F",
  "Coastal Flood Warning": "#228B22",
  "Coastal Flood Watch": "#66CDAA",
  "Coastal Flood Statement": "#6B8E23",
  "Lakeshore Flood Warning": "#228B22",
  "Lakeshore Flood Watch": "#66CDAA",
  "Lakeshore Flood Statement": "#6B8E23",
  // Tropical
  "Hurricane Warning": "#DC143C",
  "Hurricane Watch": "#FF00FF",
  "Hurricane Force Wind Warning": "#CD5C5C",
  "Inland Hurricane Wind Warning": "#CD5C5C",
  "Inland Hurricane Wind Watch": "#FFA07A",
  "Hurricane Local Statement": "#9370DB",
  "Typhoon Warning": "#DC143C",
  "Typhoon Watch": "#FF00FF",
  "Typhoon Local Statement": "#9370DB",
  "Tropical Storm Warning": "#B22222",
  "Tropical Storm Watch": "#F08080",
  "Inland Tropical Storm Warning": "#B22222",
  "Inland Tropical Storm Watch": "#F08080",
  "Tsunami Warning": "#FD6347",
  "Tsunami Watch": "#FF00FF",
  // Winter
  "Blizzard Warning": "#FF4500",
  "Blizzard Watch": "#ADFF2F",
  "Winter Storm Warning": "#FF69B4",
  "Winter Storm Watch": "#00008B",
  "Ice Storm Warning": "#8B008B",
  "Heavy Snow Warning": "#8A2BE2",
  "Heavy Sleet Warning": "#87CEEB",
  "Lake Effect Snow Warning": "#008B8B",
  "Lake Effect Snow Watch": "#CD853F",
  "Lake Effect Snow Advisory": "#48D1CC",
  "Winter Weather Advisory": "#DEB887",
  "Freezing Rain Advisory": "#6A5ACD",
  "Freezing Drizzle Advisory": "#6A5ACD",
  "Sleet Advisory": "#7B68EE",
  "Snow Advisory": "#6699CC",
  "Snow and Blowing Snow Advisory": "#B0E0E6",
  "Blowing Snow Advisory": "#ADD8E6",
  "Wind Chill Warning": "#B0C4DE",
  "Wind Chill Watch": "#5F9EA0",
  "Wind Chill Advisory": "#AFEEEE",
  "Freeze Warning": "#00FFFF",
  "Freeze Watch": "#000080",
  "Frost Advisory": "#6495ED",
  "Heavy Freezing Spray Warning": "#00BFFF",
  "Freezing Fog Advisory": "#008080",
  // Heat
  "Excessive Heat Warning": "#C71585",
  "Excessive Heat Watch": "#800000",
  "Heat Advisory": "#FF7F50",
  // Wind
  "High Wind Warning": "#DAA520",
  "High Wind Watch": "#B8860B",
  "Wind Advisory": "#90EE90",
  "Lake Wind Advisory": "#D2B48C",
  "Storm Warning": "#DDA0DD",
  "Gale Warning": "#9400D3",
  "Small Craft Advisory": "#D8BFD8",
  "Marine Weather Statement": "#9932CC",
  // Fire / Air Quality
  "Red Flag Warning": "#FF1493",
  "Fire Weather Watch": "#FFDEAD",
  "Fire Warning": "#A0522D",
  "Fire Danger Statement": "#E9967A",
  "Dense Smoke Advisory": "#F0E68C",
  "Air Stagnation Advisory": "#808080",
  "Ashfall Advisory": "#A9A9A9",
  "Blowing Dust Advisory": "#BDB76B",
  "Dust Storm Warning": "#FFE4C4",
  // Other natural hazards
  "Avalanche Warning": "#1E90FF",
  "Avalanche Watch": "#F4A460",
  "High Surf Warning": "#228B22",
  "High Surf Advisory": "#BA55D3",
  "Earthquake Warning": "#8B4513",
  "Volcano Warning": "#696969",
  // Non-weather / civil
  "Local Area Emergency": "#C0C0C0",
  "Law Enforcement Warning": "#C0C0C0",
  "911 Telephone Outage": "#C0C0C0",
  "Hazardous Materials Warning": "#4B0082",
  "Nuclear Hazard Warning": "#4B0082",
  "Radiological Hazard Warning": "#4B0082",
  "Civil Danger Warning": "#FFB6C1",
  "Civil Emergency Message": "#FFB6C1",
  "Evacuation Immediate": "#7FFF00",
  "Shelter In Place Warning": "#FA8072",
  "Child Abduction Emergency": "#FFD700",
  // General / outlooks
  "Special Weather Statement": "#FFE4B5",
  "Hazardous Weather Outlook": "#EEE8AA",
  "Short Term Forecast": "#8FBC8F",
  "Test": "#F0FFFF",
  // Visibility (kept from prior palette, no official NWS color)
  "Dense Fog Advisory": "#708090",
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
