// alerts-poll: scheduled fetch of NWS active alerts.
//
// What this function does, in order:
//   1. Pull the active NWS alert feed.
//   2. Enrich any Tornado/Severe Watch with the matching SPC product page so
//      we can detect "PDS" markers the JSON feed leaves out.
//   3. For every alert WITHOUT inline polygon geometry, resolve its
//      `affectedZones` URLs SERVER-SIDE — using a persistent `zone_geom_cache`
//      table so we don't re-hammer api.weather.gov every minute. The result
//      is stored directly in `active_alerts.geometry`, which means the front
//      end never has to perform hundreds of cross-origin round trips just to
//      paint warning polygons on the map.
//   4. Upsert + clean up expired/removed rows.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
import { createClient } from "npm:@supabase/supabase-js@2";

const NWS_URL = "https://api.weather.gov/alerts/active?status=actual";
const UA = "StormCircle/1.0 (bot@stormcircle.net)";
// Re-fetch a cached zone if it's older than this — zones do change shape
// occasionally (re-districting, WFO realignments). A day is plenty.
const ZONE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function extractWatchNumber(event: string | null | undefined, parameters: Record<string, any>, headline: string | null | undefined): string | null {
  if (event !== "Tornado Watch" && event !== "Severe Thunderstorm Watch") return null;
  const vtec = Array.isArray(parameters?.VTEC) ? parameters.VTEC.join(" ") : String(parameters?.VTEC ?? "");
  const vtecMatch = vtec.match(/\.(?:TO|SV)\.A\.(\d{4})\./i);
  if (vtecMatch) return vtecMatch[1];
  const headlineMatch = String(headline ?? "").match(/\bwatch\s+(\d{1,4})\b/i);
  if (!headlineMatch) return null;
  return headlineMatch[1].padStart(4, "0");
}

async function fetchWatchEnrichment(watchNumber: string): Promise<{ spcWatchTitle?: string; spcPds?: string }> {
  try {
    const res = await fetch(`https://www.spc.noaa.gov/products/watch/ww${watchNumber}.html`, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return {};
    const html = await res.text();
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim();
    const pds = /\bparticularly dangerous situation\b|\bpds\b/i.test(title ?? html);
    return {
      ...(title ? { spcWatchTitle: title } : {}),
      ...(pds ? { spcPds: "PDS" } : {}),
    };
  } catch {
    return {};
  }
}

type GeomT = { type: "Polygon" | "MultiPolygon"; coordinates: any } | null;

// Run async jobs with bounded concurrency. Keeps us from opening dozens of
// parallel sockets to api.weather.gov when there are hundreds of zones.
async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchZoneFromNetwork(zoneUrl: string): Promise<GeomT> {
  try {
    const res = await fetch(zoneUrl, {
      headers: { "User-Agent": UA, Accept: "application/geo+json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const geom = json?.geometry;
    if (geom?.type === "Polygon" || geom?.type === "MultiPolygon") return geom as GeomT;
    return null;
  } catch {
    return null;
  }
}

function combinePolys(geoms: GeomT[]): GeomT {
  const polys: any[] = [];
  for (const g of geoms) {
    if (!g) continue;
    if (g.type === "Polygon") polys.push(g.coordinates);
    else polys.push(...g.coordinates);
  }
  if (polys.length === 0) return null;
  if (polys.length === 1) return { type: "Polygon", coordinates: polys[0] };
  return { type: "MultiPolygon", coordinates: polys };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const res = await fetch(NWS_URL, { headers: { "User-Agent": UA, Accept: "application/geo+json" } });
    if (!res.ok) throw new Error(`NWS ${res.status}`);
    const json = await res.json();
    const features: any[] = Array.isArray(json?.features) ? json.features : [];

    // Preserve first_seen_at across upserts so the "New Warnings" panel can
    // show items first observed in the last 5 minutes.
    const { data: existing } = await supabase
      .from("active_alerts")
      .select("alert_id, first_seen_at, expires_at");
    const firstSeenById = new Map<string, string>();
    for (const r of existing ?? []) {
      if (r.first_seen_at) firstSeenById.set(r.alert_id, r.first_seen_at);
    }
    const nowIso = new Date().toISOString();

    // ----- SPC watch enrichment (existing behaviour) -----
    const uniqueWatchNumbers = Array.from(new Set(features
      .map((f) => {
        const p = f?.properties ?? {};
        return extractWatchNumber(p.event ?? null, p.parameters ?? {}, p.headline ?? null);
      })
      .filter((n): n is string => Boolean(n))));
    const watchEnrichment = new Map<string, { spcWatchTitle?: string; spcPds?: string }>();
    await Promise.all(uniqueWatchNumbers.map(async (n) => watchEnrichment.set(n, await fetchWatchEnrichment(n))));

    // ----- Server-side zone geometry resolution -----
    // Collect every zone URL referenced by an alert that lacks inline
    // geometry. Resolve them ONCE per cycle, using the persistent cache.
    const neededZones = new Set<string>();
    for (const f of features) {
      const hasInline = f?.geometry?.type === "Polygon" || f?.geometry?.type === "MultiPolygon";
      if (hasInline) continue;
      const zones: string[] = Array.isArray(f?.properties?.affectedZones) ? f.properties.affectedZones : [];
      for (const z of zones) if (typeof z === "string" && z.startsWith("http")) neededZones.add(z);
    }
    const zoneList = Array.from(neededZones);
    const zoneGeom = new Map<string, GeomT>();

    if (zoneList.length > 0) {
      // Pull whatever the cache already has — Postgres handles `.in()` up
      // to a generous size; chunk just in case there's a national outbreak.
      const CHUNK = 500;
      const cutoff = new Date(Date.now() - ZONE_CACHE_TTL_MS).toISOString();
      for (let i = 0; i < zoneList.length; i += CHUNK) {
        const slice = zoneList.slice(i, i + CHUNK);
        const { data: cached } = await supabase
          .from("zone_geom_cache")
          .select("zone_url, geometry, fetched_at")
          .in("zone_url", slice);
        for (const row of cached ?? []) {
          if (row.fetched_at && row.fetched_at >= cutoff && row.geometry) {
            zoneGeom.set(row.zone_url, row.geometry as GeomT);
          }
        }
      }

      // Anything not in the cache (or expired) → fetch from NWS, then write
      // back to the cache for everyone (including all clients) to benefit.
      const missing = zoneList.filter((z) => !zoneGeom.has(z));
      if (missing.length > 0) {
        const fetched = await runWithConcurrency(missing, 8, fetchZoneFromNetwork);
        const upserts: { zone_url: string; geometry: any; fetched_at: string }[] = [];
        for (let i = 0; i < missing.length; i++) {
          const g = fetched[i];
          if (g) {
            zoneGeom.set(missing[i], g);
            upserts.push({ zone_url: missing[i], geometry: g, fetched_at: nowIso });
          }
        }
        if (upserts.length > 0) {
          for (let i = 0; i < upserts.length; i += 200) {
            const slice = upserts.slice(i, i + 200);
            const { error } = await supabase
              .from("zone_geom_cache")
              .upsert(slice, { onConflict: "zone_url" });
            if (error) console.warn("[alerts-poll] zone cache upsert err:", error);
          }
        }
      }
    }

    // ----- Build rows -----
    const rows = features.map((f) => {
      const p = f.properties ?? {};
      const id = String(p.id ?? f.id);

      let geom: GeomT = null;
      if (f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon") {
        geom = f.geometry as GeomT;
      } else {
        const zones: string[] = Array.isArray(p.affectedZones) ? p.affectedZones : [];
        if (zones.length > 0) {
          const resolved = zones.map((z) => zoneGeom.get(z) ?? null);
          geom = combinePolys(resolved);
        }
      }

      const watchNumber = extractWatchNumber(p.event ?? null, p.parameters ?? {}, p.headline ?? null);
      const enrich = watchNumber ? watchEnrichment.get(watchNumber) : undefined;

      return {
        alert_id: id,
        event: p.event ?? null,
        severity: p.severity ?? null,
        certainty: p.certainty ?? null,
        urgency: p.urgency ?? null,
        headline: p.headline ?? null,
        area_desc: p.areaDesc ?? null,
        sent: p.sent ?? null,
        effective: p.effective ?? null,
        onset: p.onset ?? null,
        expires_at: p.expires ?? null,
        ends: p.ends ?? null,
        status: p.status ?? null,
        message_type: p.messageType ?? null,
        geometry: geom,
        properties: {
          description: p.description ?? "",
          headline: p.headline ?? "",
          parameters: {
            ...(p.parameters ?? {}),
            ...(watchNumber ? { spcWatchNumber: watchNumber } : {}),
            ...(enrich ?? {}),
          },
          affectedZones: Array.isArray(p.affectedZones) ? p.affectedZones : [],
        },
        updated_at: nowIso,
        first_seen_at: firstSeenById.get(id) ?? nowIso,
      };
    });

    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { error } = await supabase.from("active_alerts").upsert(slice, { onConflict: "alert_id" });
      if (error) console.warn("[alerts-poll] batch upsert err:", error);
    }

    const currentIds = new Set(rows.map((r) => r.alert_id));
    const toDelete = (existing ?? []).filter((r: any) => {
      if (!currentIds.has(r.alert_id)) return true;
      if (r.expires_at && new Date(r.expires_at).getTime() < Date.now()) return true;
      return false;
    }).map((r: any) => r.alert_id);
    if (toDelete.length > 0) {
      for (let i = 0; i < toDelete.length; i += BATCH) {
        const chunk = toDelete.slice(i, i + BATCH);
        await supabase.from("active_alerts").delete().in("alert_id", chunk);
      }
    }

    const resolvedCount = rows.filter((r) => r.geometry).length;
    return new Response(JSON.stringify({
      ok: true,
      upserted: rows.length,
      deleted: toDelete.length,
      withGeometry: resolvedCount,
      zoneCacheHits: zoneList.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[alerts-poll]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
