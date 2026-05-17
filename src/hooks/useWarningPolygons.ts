import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

/**
 * Module-scoped cache of NWS zone geometries (county/forecast/fire/marine).
 * Zones rarely change shape, so we cache forever for the page session. Keyed
 * by the full zone URL (e.g. https://api.weather.gov/zones/county/ILC177).
 * Values may be a Promise to deduplicate concurrent in-flight fetches.
 */
type ZoneGeom = GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
const zoneGeomCache = new Map<string, ZoneGeom | Promise<ZoneGeom>>();

async function fetchZoneGeometry(zoneUrl: string): Promise<ZoneGeom> {
  const cached = zoneGeomCache.get(zoneUrl);
  if (cached !== undefined) return cached as ZoneGeom | Promise<ZoneGeom>;

  const promise = (async (): Promise<ZoneGeom> => {
    try {
      const res = await fetch(zoneUrl, {
        headers: { "User-Agent": "MyWeatherApp/1.0", Accept: "application/geo+json" },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const geom = json?.geometry;
      if (!geom) return null;
      if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
        zoneGeomCache.set(zoneUrl, geom);
        return geom as ZoneGeom;
      }
      return null;
    } catch {
      return null;
    }
  })();

  zoneGeomCache.set(zoneUrl, promise);
  const resolved = await promise;
  zoneGeomCache.set(zoneUrl, resolved);
  return resolved;
}

/**
 * Resolve an alert's `affectedZones` URLs into a single MultiPolygon by
 * fetching each zone (with caching) and concatenating their polygon rings.
 */
async function resolveZonesGeometry(
  zoneUrls: string[],
): Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon | null> {
  const geoms = await Promise.all(zoneUrls.map((u) => fetchZoneGeometry(u)));
  const polys: number[][][][] = [];
  for (const g of geoms) {
    if (!g) continue;
    if (g.type === "Polygon") {
      polys.push(g.coordinates as number[][][]);
    } else {
      polys.push(...(g.coordinates as number[][][][]));
    }
  }
  if (polys.length === 0) return null;
  if (polys.length === 1) {
    return { type: "Polygon", coordinates: polys[0] };
  }
  return { type: "MultiPolygon", coordinates: polys };
}

/** Build a WarningPolygon record from an alert feature + resolved geometry. */
function toWarningPolygon(
  f: any,
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): WarningPolygon {
  const props = f.properties ?? {};
  return {
    id: String(props.id ?? f.id),
    event: String(props.event),
    areaDesc: String(props.areaDesc ?? ""),
    expires: String(props.expires ?? ""),
    description: String(props.description ?? ""),
    headline: String(props.headline ?? ""),
    severity: String(props.severity ?? ""),
    certainty: String(props.certainty ?? ""),
    urgency: String(props.urgency ?? ""),
    parameters: props.parameters ?? {},
    color: getWarningColor(props),
    geometry,
  };
}

/**
 * Subscribes to the server-maintained `active_alerts` table. The
 * `alerts-poll` edge function refreshes this every minute via pg_cron.
 * For alerts without inline geometry, we still resolve their
 * `affectedZones` URLs client-side (cached per session) — same behaviour
 * as before, just no longer every client hammering NWS.
 */
export function useWarningPolygons(): WarningPolygonsData {
  const [data, setData] = useState<WarningPolygonsData>({
    polygons: [], loading: true, error: null, lastUpdated: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: rows, error } = await supabase
          .from("active_alerts")
          .select("alert_id, event, severity, certainty, urgency, headline, area_desc, expires_at, geometry, properties");
        if (error) throw error;

        const inline: WarningPolygon[] = [];
        const zoneJobs: Promise<WarningPolygon | null>[] = [];

        for (const r of rows ?? []) {
          const props = {
            id: r.alert_id,
            event: r.event,
            areaDesc: r.area_desc,
            expires: r.expires_at,
            description: (r.properties as any)?.description ?? "",
            headline: r.headline,
            severity: r.severity,
            certainty: r.certainty,
            urgency: r.urgency,
            parameters: (r.properties as any)?.parameters ?? {},
          };
          const feat = { properties: props } as any;
          if (r.geometry) {
            inline.push(toWarningPolygon(feat, r.geometry as any));
          } else {
            const zones: string[] = (r.properties as any)?.affectedZones ?? [];
            if (zones.length > 0) {
              zoneJobs.push(
                resolveZonesGeometry(zones).then((g) => g ? toWarningPolygon(feat, g) : null),
              );
            }
          }
        }

        const zonePolys = (await Promise.all(zoneJobs)).filter((p): p is WarningPolygon => p !== null);
        if (cancelled) return;
        setData({
          polygons: [...inline, ...zonePolys],
          loading: false, error: null, lastUpdated: new Date(),
        });
      } catch (err) {
        if (!cancelled) {
          setData((prev) => ({ ...prev, loading: false,
            error: err instanceof Error ? err.message : "Failed to load warnings" }));
        }
      }
    }

    void load();
    const channel = supabase
      .channel("active_alerts_live")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "active_alerts" },
        () => { void load(); })
      .subscribe();

    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, []);

  return data;
}

