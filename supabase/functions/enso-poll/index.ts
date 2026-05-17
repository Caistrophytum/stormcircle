// enso-poll: scheduled refresh of the latest ENSO state.
// Writes to enso_state. The Hurricane Bot reads this row for its season-status card.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
import { createClient } from "npm:@supabase/supabase-js@2";

const WEEKLY_URL = "https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for";
const ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";

function classify(v: number) {
  if (v >= 0.5) return { phase: "El Niño", lean: "warm" };
  if (v <= -0.5) return { phase: "La Niña", lean: "cool" };
  if (v > 0) return { phase: "Neutral", lean: "warm-leaning" };
  if (v < 0) return { phase: "Neutral", lean: "cool-leaning" };
  return { phase: "Neutral", lean: "neutral" };
}

function parseWeekly(text: string) {
  const lines = text.trim().split("\n").filter((l) => /\d{2}[A-Z]{3}\d{4}/.test(l));
  const last = lines[lines.length - 1];
  if (!last) return null;
  const m = last.match(/(\d{2}[A-Z]{3}\d{4})/);
  const week = m ? m[1] : "";
  const nums = last.replace(/\d{2}[A-Z]{3}\d{4}/, "").trim().split(/\s+/).map(parseFloat);
  if (nums.length < 6 || !isFinite(nums[5])) return null;
  return { anom: nums[5], week };
}
function fmtWeek(w: string) {
  const m = w.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
  if (!m) return w;
  const months: Record<string, string> = {
    JAN: "Jan", FEB: "Feb", MAR: "Mar", APR: "Apr", MAY: "May", JUN: "Jun",
    JUL: "Jul", AUG: "Aug", SEP: "Sep", OCT: "Oct", NOV: "Nov", DEC: "Dec",
  };
  return `${months[m[2]] ?? m[2]} ${parseInt(m[1], 10)}, ${m[3]}`;
}

async function fetchWeekly() {
  const res = await fetch(WEEKLY_URL, { headers: { "User-Agent": "StratoOps/1.0" } });
  if (!res.ok) throw new Error(`weekly ${res.status}`);
  const p = parseWeekly(await res.text());
  if (!p) throw new Error("weekly parse failed");
  const { phase, lean } = classify(p.anom);
  return { source: "weekly", region: "Niño 3.4", oni: p.anom, phase, lean,
    season: `week of ${fmtWeek(p.week)}`, year: p.week.slice(-4) };
}
async function fetchMonthly() {
  const res = await fetch(ONI_URL, { headers: { "User-Agent": "StratoOps/1.0" } });
  if (!res.ok) throw new Error(`ONI ${res.status}`);
  const lines = (await res.text()).trim().split("\n").slice(1).filter(Boolean);
  const last = lines[lines.length - 1].trim().split(/\s+/);
  const anom = parseFloat(last[3]);
  if (!isFinite(anom)) throw new Error("ONI parse failed");
  const { phase, lean } = classify(anom);
  return { source: "monthly", region: "ONI", oni: anom, phase, lean, season: last[0], year: last[1] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    let payload;
    try { payload = await fetchWeekly(); }
    catch (e) { console.warn("[enso-poll] weekly failed, falling back:", e); payload = await fetchMonthly(); }
    await supabase.from("enso_state").update({
      ...payload, last_run_at: new Date().toISOString(), last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    return new Response(JSON.stringify({ ok: true, ...payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[enso-poll]", e);
    await supabase.from("enso_state").update({
      last_run_at: new Date().toISOString(), last_error: String(e),
    }).eq("id", 1);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
