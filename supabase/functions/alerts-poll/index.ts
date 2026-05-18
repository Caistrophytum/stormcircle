// alerts-poll: scheduled fetch of NWS active alerts.
// Upserts into active_alerts table. Inline polygon geometry is stored;
// zone-based alerts store affectedZones URLs in `properties` for the
// client to resolve (cached per-session) — same as before, just shared.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
import { createClient } from "npm:@supabase/supabase-js@2";

// Note: we intentionally do NOT filter by message_type. NWS issues
// continuation/extension SVRs as `Update` messages — filtering to `alert`
// only drops still-active warnings from the feed.
const NWS_URL = "https://api.weather.gov/alerts/active?status=actual";
const UA = "StormCircle/1.0 (bot@stormcircle.net)";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const res = await fetch(NWS_URL, { headers: { "User-Agent": UA, Accept: "application/geo+json" } });
    if (!res.ok) throw new Error(`NWS ${res.status}`);
    const json = await res.json();
    const features: any[] = Array.isArray(json?.features) ? json.features : [];

    // Preserve first_seen_at across upserts so the "New Warnings" panel can
    // show items first observed in the last 5 minutes, even when no client
    // is online to observe them in-browser.
    const { data: existing } = await supabase
      .from("active_alerts")
      .select("alert_id, first_seen_at, expires_at");
    const firstSeenById = new Map<string, string>();
    for (const r of existing ?? []) {
      if (r.first_seen_at) firstSeenById.set(r.alert_id, r.first_seen_at);
    }
    const nowIso = new Date().toISOString();

    const uniqueWatchNumbers = Array.from(new Set(features
      .map((f) => {
        const p = f?.properties ?? {};
        return extractWatchNumber(p.event ?? null, p.parameters ?? {}, p.headline ?? null);
      })
      .filter((n): n is string => Boolean(n))));
    const watchEnrichment = new Map<string, { spcWatchTitle?: string; spcPds?: string }>();
    await Promise.all(uniqueWatchNumbers.map(async (watchNumber) => {
      watchEnrichment.set(watchNumber, await fetchWatchEnrichment(watchNumber));
    }));

    const rows = features.map((f) => {
      const p = f.properties ?? {};
      const id = String(p.id ?? f.id);
      const geom = f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
        ? f.geometry : null;
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
        // Keep only the fields the UI actually reads to keep rows small.
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

    // Batch upsert (PostgREST handles arrays)
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { error } = await supabase.from("active_alerts").upsert(slice, { onConflict: "alert_id" });
      if (error) console.warn("[alerts-poll] batch upsert err:", error);
    }

    // Delete rows no longer in feed OR already expired
    const currentIds = new Set(rows.map((r) => r.alert_id));
    const toDelete = (existing ?? []).filter((r: any) => {
      if (!currentIds.has(r.alert_id)) return true;
      if (r.expires_at && new Date(r.expires_at).getTime() < Date.now()) return true;
      return false;
    }).map((r: any) => r.alert_id);
    if (toDelete.length > 0) {
      // chunk delete
      for (let i = 0; i < toDelete.length; i += BATCH) {
        const chunk = toDelete.slice(i, i + BATCH);
        await supabase.from("active_alerts").delete().in("alert_id", chunk);
      }
    }

    return new Response(JSON.stringify({ ok: true, upserted: rows.length, deleted: toDelete.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[alerts-poll]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
