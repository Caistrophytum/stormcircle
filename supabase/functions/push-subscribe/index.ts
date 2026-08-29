// push-subscribe: registers / removes a browser push subscription for the
// signed-in user, and exposes the VAPID public key the browser needs before
// it can create one.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";

  // Unauthenticated bootstrap: the client needs the public key to subscribe.
  if (req.method === "GET") return json({ publicKey });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = String(body.action ?? "subscribe");
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  if (!endpoint || endpoint.length > 2048) return json({ error: "Invalid endpoint" }, 400);

  if (action === "unsubscribe") {
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);
    return json({ ok: true });
  }

  const p256dh = typeof body.p256dh === "string" ? body.p256dh : "";
  const authKey = typeof body.auth === "string" ? body.auth : "";
  if (!p256dh || !authKey) return json({ error: "Missing subscription keys" }, 400);

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth_key: authKey,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) return json({ error: error.message }, 400);

  // Make sure a preference row exists so the dispatcher picks the user up.
  await supabase.from("notification_prefs").upsert({ user_id: user.id }, { onConflict: "user_id" });

  return json({ ok: true, publicKey });
});
