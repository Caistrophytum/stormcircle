// Geometry resolution for MeteoAlarm CAP areas.
//
// CAP areas describe their footprint in one of three ways:
//   * `polygon`  - explicit "lat,lon lat,lon ..." rings (Norway, UK, ...)
//   * `circle`   - "lat,lon radiusKm"
//   * `geocode`  - a region code, either NUTS3 (France) or MeteoAlarm's own
//                  EMMA_ID (most members)
//
// Region codes are looked up in `public.warning_regions`, a preloaded table of
// simplified boundaries (Eurostat GISCO NUTS3 + MeteoAlarm EMMA awareness
// regions). One batched query per poll run covers every code we need.

export type Geometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

type Area = {
  areaDesc?: string;
  polygon?: string[];
  circle?: string[];
  geocode?: { value?: string; valueName?: string }[];
};

/** CAP rings are "lat,lon" pairs; GeoJSON wants [lon, lat]. */
function parseCapPolygon(raw: string): number[][] | null {
  const ring = raw
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [lat, lon] = pair.split(",").map(Number);
      return Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null;
    })
    .filter((p): p is number[] => p !== null);
  if (ring.length < 4) return null;
  const [f, l] = [ring[0], ring[ring.length - 1]];
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
  return ring;
}

/** "lat,lon radiusKm" -> a 24-point circle approximation. */
function parseCapCircle(raw: string): number[][] | null {
  const [center, radiusRaw] = raw.trim().split(/\s+/);
  const [lat, lon] = (center ?? "").split(",").map(Number);
  const radiusKm = Number(radiusRaw);
  if (![lat, lon, radiusKm].every(Number.isFinite) || radiusKm <= 0) return null;
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const ring: number[][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

/** Region-table key for a CAP geocode entry, or null when unsupported. */
function geocodeKey(name: string, value: string): string | null {
  const n = name.trim().toUpperCase();
  const v = value.trim().toUpperCase();
  if (!v) return null;
  if (n === "EMMA_ID") return `emma:${v}`;
  if (n === "NUTS3" || n === "NUTS") return `nuts3:${v}`;
  return null;
}

function toPolygons(g: Geometry | null): number[][][][] {
  if (!g) return [];
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}

// deno-lint-ignore no-explicit-any
type Client = any;

export class GeometryResolver {
  private cache = new Map<string, Geometry>();
  private missing = new Set<string>();

  constructor(private supabase: Client) {}

  /** Load every region code referenced by this run in one query. */
  async prepare(areaGroups: Area[][]): Promise<void> {
    const keys = new Set<string>();
    for (const areas of areaGroups) {
      for (const area of areas) {
        for (const gc of area.geocode ?? []) {
          const key = geocodeKey(String(gc.valueName ?? ""), String(gc.value ?? ""));
          if (key) keys.add(key);
        }
      }
    }
    const all = [...keys];
    for (let i = 0; i < all.length; i += 500) {
      const { data, error } = await this.supabase
        .from("warning_regions")
        .select("code, geometry")
        .in("code", all.slice(i, i + 500));
      if (error) {
        console.warn("[meteoalarm-poll] region lookup failed:", error.message);
        continue;
      }
      for (const row of data ?? []) this.cache.set(row.code, row.geometry as Geometry);
    }
    for (const key of all) if (!this.cache.has(key)) this.missing.add(key);
  }

  /** Merge every area of one warning into a single (Multi)Polygon. */
  resolve(areas: Area[]): Geometry | null {
    const polys: number[][][][] = [];

    for (const area of areas) {
      let matched = false;

      for (const raw of area.polygon ?? []) {
        const ring = parseCapPolygon(raw);
        if (ring) {
          polys.push([ring]);
          matched = true;
        }
      }
      for (const raw of area.circle ?? []) {
        const ring = parseCapCircle(raw);
        if (ring) {
          polys.push([ring]);
          matched = true;
        }
      }
      if (matched) continue;

      for (const gc of area.geocode ?? []) {
        const key = geocodeKey(String(gc.valueName ?? ""), String(gc.value ?? ""));
        if (!key) continue;
        const geom = this.cache.get(key);
        if (geom) polys.push(...toPolygons(geom));
      }
    }

    if (!polys.length) return null;
    if (polys.length === 1) return { type: "Polygon", coordinates: polys[0] };
    return { type: "MultiPolygon", coordinates: polys };
  }

  /** Region codes we could not map, for observability. */
  unresolved(): string[] {
    return [...this.missing].slice(0, 25);
  }
}
