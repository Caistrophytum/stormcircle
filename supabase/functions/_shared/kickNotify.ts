// Starts a scoped notify-dispatch run right after new data lands, so urgent
// notifications go out in seconds without a high-frequency cron.
export function kickNotify(mode: "alerts" | "chat"): void {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-dispatch`;
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  if (!secret) return;
  const p = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": secret },
    body: JSON.stringify({ mode }),
  }).then((r) => r.body?.cancel()).catch((e) => console.warn("[kickNotify]", String(e)));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
}
