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
    params.spcWatchTitle ?? "",
    params.spcPds ?? "",
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
  // Use the full haystack (description + headline + NWSheadline + params)
  // so SPC tags on Watches — e.g. "PDS Tornado Watch" which lives in the
  // headline/parameters rather than the description — are picked up too.
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

/**
 * Module-scoped cache of NWS zone geometries (county/forecast/fire/marine).
 * Zones rarely change shape, so we cache forever for the page session AND
 * persist to localStorage so subsequent page loads skip the network round
 * trip entirely (the slowest part of polygon rendering). Values may be a
 * Promise to deduplicate concurrent in-flight fetches.
 */
type ZoneGeom = GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
const zoneGeomCache = new Map<string, ZoneGeom | Promise<ZoneGeom>>();

const LS_KEY = "nws-zone-geom-v1";
// Rehydrate from localStorage on module load. Cheap: a few hundred KB max,
// JSON.parse runs once. Wrapped in try/catch for Safari private mode etc.
try {
  if (typeof window !== "undefined" && window.localStorage) {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const entries: [string, ZoneGeom][] = JSON.parse(raw);
      for (const [k, v] of entries) zoneGeomCache.set(k, v);
    }
  }
} catch { /* ignore */ }

let lsFlushScheduled = false;
function scheduleLsFlush() {
  if (lsFlushScheduled || typeof window === "undefined") return;
  lsFlushScheduled = true;
  const flush = () => {
    lsFlushScheduled = false;
    try {
      const out: [string, ZoneGeom][] = [];
      for (const [k, v] of zoneGeomCache) {
        if (v && !(v instanceof Promise)) out.push([k, v]);
      }
      window.localStorage.setItem(LS_KEY, JSON.stringify(out));
    } catch { /* quota / private mode — ignore */ }
  };
  // Coalesce many writes into one idle pass.
  if ((window as any).requestIdleCallback) {
    (window as any).requestIdleCallback(flush, { timeout: 2000 });
  } else {
    setTimeout(flush, 1000);
  }
}

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
        scheduleLsFlush();
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
  if (resolved) scheduleLsFlush();
  return resolved;
}

/** Run async jobs with a bounded concurrency. Preserves output order. */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Resolve an alert's `affectedZones` URLs into a single MultiPolygon by
 * fetching each zone (with caching) and concatenating their polygon rings.
 * Fetches are concurrency-limited so a national alerts day doesn't open
 * dozens of parallel api.weather.gov requests that compete with map tiles.
 */
async function resolveZonesGeometry(
  zoneUrls: string[],
): Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon | null> {
  const geoms = await runWithConcurrency(zoneUrls, 4, (u) => fetchZoneGeometry(u));
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

        if (cancelled) return;
        // Paint inline polygons immediately — most warnings have inline
        // geometry, and we shouldn't make them wait on slow api.weather.gov
        // zone fetches. Zone-based polys stream in next.
        setData({
          polygons: inline,
          loading: zoneJobs.length > 0,
          error: null,
          lastUpdated: new Date(),
        });
        if (zoneJobs.length === 0) return;

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

    // Defer the initial alerts query so the radar tiles and basemap get
    // the first network/CPU slot. Falls back to a 500ms timeout in
    // browsers without requestIdleCallback (Safari).
    const ric: (cb: () => void) => number =
      (window as any).requestIdleCallback
        ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 1500 })
        : (cb) => window.setTimeout(cb, 500);
    const cic: (id: number) => void =
      (window as any).cancelIdleCallback
        ? (id) => (window as any).cancelIdleCallback(id)
        : (id) => window.clearTimeout(id);
    const idleId = ric(() => { void load(); });

    // Unique channel name per mount — see useAlerts.ts for the full rationale.
    const channelName = `active_alerts_live_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "active_alerts" },
        () => { void load(); })
      .subscribe();

    return () => {
      cancelled = true;
      cic(idleId);
      void supabase.removeChannel(channel);
    };
  }, []);

  return data;
}

