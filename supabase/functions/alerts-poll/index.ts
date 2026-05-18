// alerts-poll: scheduled fetch of NWS active alerts.
// Upserts into active_alerts table. Inline polygon geometry is stored;
// zone-based alerts store affectedZones URLs in `properties` for the
// client to resolve (cached per-session) — same as before, just shared.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
import { createClient } from "npm:@supabase/supabase-js@2";

const NWS_URL = "https://api.weather.gov/alerts/active?status=actual&message_type=alert";
const UA = "StormCircle/1.0 (bot@stormcircle.net)";

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

    const rows = features.map((f) => {
      const p = f.properties ?? {};
      const id = String(p.id ?? f.id);
      const geom = f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
        ? f.geometry : null;
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
          parameters: p.parameters ?? {},
          affectedZones: Array.isArray(p.affectedZones) ? p.affectedZones : [],
        },
        updated_at: new Date().toISOString(),
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
    const { data: existing } = await supabase.from("active_alerts").select("alert_id, expires_at");
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
