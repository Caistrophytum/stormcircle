// username-login: lets a visitor sign in with their username instead of email.
// The username -> email lookup happens here with server privileges so emails
// are never exposed to the browser. Every credential failure returns the same
// generic 401 so usernames cannot be enumerated.
import { createClient } from "npm:@supabase/supabase-js@2";
import { rateLimit, clientIp } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = clientIp(req);
  const ipLimit = rateLimit(`ulogin:ip:${ip}`, 10, 60_000);
  if (!ipLimit.allowed) {
    return json({ error: "rate_limited" }, 429, { "Retry-After": String(ipLimit.retryAfter) });
  }

  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = String(body?.username ?? "").trim();
    password = String(body?.password ?? "");
  } catch {
    return json({ error: "invalid_credentials" }, 401);
  }
  if (!USERNAME_RE.test(username) || password.length < 1 || password.length > 128) {
    return json({ error: "invalid_credentials" }, 401);
  }

  const userLimit = rateLimit(`ulogin:user:${username.toLowerCase()}`, 8, 5 * 60_000);
  if (!userLimit.allowed) {
    return json({ error: "rate_limited" }, 429, { "Retry-After": String(userLimit.retryAfter) });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    const { data: profile, error: lookupErr } = await admin
      .from("profiles")
      .select("email")
      .ilike("username", username)
      .limit(1)
      .maybeSingle();
    if (lookupErr) {
      console.error("[username-login] lookup failed", lookupErr.message);
      return json({ error: "unavailable" }, 503);
    }
    if (!profile?.email) return json({ error: "invalid_credentials" }, 401);

    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.auth.signInWithPassword({
      email: profile.email,
      password,
    });
    if (error || !data.session) {
      const status = (error as { status?: number } | null)?.status ?? 0;
      if (status === 0 || status >= 500) return json({ error: "unavailable" }, 503);
      // Unconfirmed email and wrong password both collapse to the same answer.
      return json({ error: "invalid_credentials" }, 401);
    }
    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (err) {
    console.error("[username-login] failed", err);
    return json({ error: "unavailable" }, 503);
  }
});
