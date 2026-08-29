// enso-poll: scheduled refresh of the latest ENSO state.
// Writes to enso_state. The Hurricane Bot reads this row for its season-status card.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
import { createClient } from "npm:@supabase/supabase-js@2";

// Primary: CPC weekly OISSTv2 Niño-region SSTs (baseline 1991-2020). Rows:
//   DDMMMYYYY  N1+2 SST ANOM  N3 SST ANOM  N3.4 SST ANOM  N4 SST ANOM
// This is the most recent ENSO observation CPC publishes (updated Mondays).
const WEEKLY_URL = "https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for";
// Fallback 1: ERSSTv5 monthly Niño-region SSTs (official monthly product).
//   YR MON  N1+2 ANOM  N3 ANOM  N4 ANOM  N3.4 ANOM
const MONTHLY_URL = "https://www.cpc.ncep.noaa.gov/data/indices/ersst5.nino.mth.91-20.ascii";
// Fallback 2: 3-month running ONI (also ERSSTv5, smoother).
const ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function classify(v: number) {
  if (v >= 0.5) return { phase: "El Niño", lean: "warm" };
  if (v <= -0.5) return { phase: "La Niña", lean: "cool" };
  if (v > 0) return { phase: "Neutral", lean: "warm-leaning" };
  if (v < 0) return { phase: "Neutral", lean: "cool-leaning" };
  return { phase: "Neutral", lean: "neutral" };
}


// Weekly rows can print values without separating spaces when negative
// (e.g. "29.4-0.2"), so pull numbers with a regex rather than splitting.
async function fetchWeeklyN34() {
  const res = await fetch(WEEKLY_URL, { headers: { "User-Agent": "StratoOps/1.0" } });
  if (!res.ok) throw new Error(`weekly ${res.status}`);
  const lines = (await res.text()).split("\n").map((l) => l.trim()).filter(Boolean);
  const dataLines = lines.filter((l) => /^\d{2}[A-Z]{3}\d{4}/.test(l));
  const last = dataLines[dataLines.length - 1];
  if (!last) throw new Error("weekly: no data row");
  const week = last.slice(0, 9);
  const nums = (last.slice(9).match(/-?\d+\.\d+/g) ?? []).map(Number);
  if (nums.length < 8) throw new Error("weekly: short row");
  const anom = nums[5]; // Niño 3.4 anomaly (4th SST/ANOM pair is Niño 4)
  if (!isFinite(anom)) throw new Error("weekly: bad anom");
  const { phase, lean } = classify(anom);
  const day = week.slice(0, 2);
  const mon = week.slice(2, 5);
  const year = week.slice(5);
  const pretty = `week ending ${day} ${mon.charAt(0)}${mon.slice(1).toLowerCase()} ${year}`;
  return {
    source: "weekly", region: "Niño 3.4", oni: anom, phase, lean,
    season: pretty, year,
  };
}


async function fetchMonthlyN34() {
  const res = await fetch(MONTHLY_URL, { headers: { "User-Agent": "StratoOps/1.0" } });
  if (!res.ok) throw new Error(`monthly ${res.status}`);
  const lines = (await res.text()).split("\n").map((l) => l.trim()).filter(Boolean);
  // Last row that begins with a 4-digit year - last column pair is Niño 3.4.
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
    try { payload = await fetchWeeklyN34(); }
    catch (e1) {
      console.warn("[enso-poll] weekly failed, falling back to monthly:", e1);
      try { payload = await fetchMonthlyN34(); }
      catch (e2) { console.warn("[enso-poll] monthly failed, falling back to ONI:", e2); payload = await fetchONI(); }
    }
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
