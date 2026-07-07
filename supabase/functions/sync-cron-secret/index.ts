// sync-cron-secret: mirrors CRON_SECRET env var into vault entry `cron_secret`
// so pg_cron SQL can read it. Idempotent; safe to call anytime.
//
// Access control: this function performs a privileged vault write, so only
// service-role callers may invoke it. All other callers (including any
// authenticated user) receive 403.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Require the service-role key in the Authorization header. Any other
  // token (anon, authenticated user JWT) is rejected. This function is
  // for one-off/admin bootstrap only.
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!SERVICE_ROLE || token !== SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) {
    return new Response(JSON.stringify({ error: "CRON_SECRET env not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    SERVICE_ROLE,
  );
  const { error } = await supabase.rpc("upsert_cron_secret", { _val: CRON_SECRET });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
