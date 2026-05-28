// sync-cron-secret: idempotently mirror the CRON_SECRET env var into a
// vault entry named `cron_secret` so pg_cron SQL can read it. Safe to call
// anytime; only copies a server-only env to a server-only vault entry.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) {
    return new Response(JSON.stringify({ error: "CRON_SECRET env not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  // Upsert vault entry. Use vault.create_secret / update_secret via SQL.
  // We expose a server-side RPC pattern: try update, if no row, create.
  const { data: existing, error: selErr } = await supabase
    .schema("vault" as any)
    .from("secrets")
    .select("id")
    .eq("name", "cron_secret")
    .maybeSingle();
  if (selErr) {
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (existing?.id) {
    const { error } = await supabase.rpc("vault_update_cron_secret", { _val: CRON_SECRET });
    if (error) return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } else {
    const { error } = await supabase.rpc("vault_create_cron_secret", { _val: CRON_SECRET });
    if (error) return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
