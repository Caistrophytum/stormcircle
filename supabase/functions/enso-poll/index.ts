// enso-poll: scheduled refresh of the latest ENSO state.
// Writes to enso_state. The Hurricane Bot reads this row for its season-status card.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
import { createClient } from "npm:@supabase/supabase-js@2";

// Primary: ERSSTv5 monthly Niño-region SSTs (NOAA CPC's official monthly
// product, baseline 1991-2020). Columns:
//   YR MON  N1+2 ANOM  N3 ANOM  N4 ANOM  N3.4 ANOM
// The Niño 3.4 anomaly here is what CPC quotes in its monthly ENSO
// diagnostic discussions. The OISST weekly file (wksst9120.for) is a
// different product whose single-week values often diverge by >1 °C from
// the monthly ERSSTv5 number, so we no longer use it as the primary source.
const MONTHLY_URL = "https://www.cpc.ncep.noaa.gov/data/indices/ersst5.nino.mth.91-20.ascii";
// Fallback: 3-month running ONI (also ERSSTv5, smoother — used only if the
// monthly file is unavailable).
const ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function classify(v: number) {
  if (v >= 0.5) return { phase: "El Niño", lean: "warm" };
  if (v <= -0.5) return { phase: "La Niña", lean: "cool" };
  if (v > 0) return { phase: "Neutral", lean: "warm-leaning" };
  if (v < 0) return { phase: "Neutral", lean: "cool-leaning" };
  return { phase: "Neutral", lean: "neutral" };
}

async function fetchMonthlyN34() {
  const res = await fetch(MONTHLY_URL, { headers: { "User-Agent": "StratoOps/1.0" } });
  if (!res.ok) throw new Error(`monthly ${res.status}`);
  const lines = (await res.text()).split("\n").map((l) => l.trim()).filter(Boolean);
  // Last row that begins with a 4-digit year — last column pair is Niño 3.4.
  const dataLines = lines.filter((l) => /^\d{4}\s/.test(l));
  const last = dataLines[dataLines.length - 1];
  if (!last) throw new Error("monthly: no data row");
  const tok = last.split(/\s+/);
  if (tok.length < 10) throw new Error("monthly: short row");
  const year = parseInt(tok[0], 10);
  const month = parseInt(tok[1], 10);
  const anom = parseFloat(tok[9]); // Niño 3.4 anomaly
  if (!isFinite(anom)) throw new Error("monthly: bad anom");
  const { phase, lean } = classify(anom);
  return {
    source: "monthly", region: "Niño 3.4", oni: anom, phase, lean,
    season: `${MONTHS_SHORT[month - 1] ?? month} ${year}`, year: String(year),
  };
}

async function fetchONI() {
  const res = await fetch(ONI_URL, { headers: { "User-Agent": "StratoOps/1.0" } });
  if (!res.ok) throw new Error(`ONI ${res.status}`);
  const lines = (await res.text()).trim().split("\n").slice(1).filter(Boolean);
  const last = lines[lines.length - 1].trim().split(/\s+/);
  const anom = parseFloat(last[3]);
  if (!isFinite(anom)) throw new Error("ONI parse failed");
  const { phase, lean } = classify(anom);
  return { source: "oni", region: "ONI", oni: anom, phase, lean, season: last[0], year: last[1] };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const authorized =
    auth === `Bearer ${SERVICE_KEY}` ||
    (CRON_SECRET && (cronHeader === CRON_SECRET || auth === `Bearer ${CRON_SECRET}`));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);
  try {
    let payload;
    try { payload = await fetchMonthlyN34(); }
    catch (e) { console.warn("[enso-poll] monthly failed, falling back to ONI:", e); payload = await fetchONI(); }
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
