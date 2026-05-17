// Edge function: returns the latest ENSO state.
// Primary signal: NOAA CPC weekly Niño 3.4 SST anomaly (updated every Monday),
// which is far more current than the monthly ONI (~1-month lag).
// Falls back to the monthly ONI ASCII file if the weekly file fails.
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const WEEKLY_URL = "https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for";
const ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";

// CPC thresholds: |anom| >= 0.5 sustained = El Niño / La Niña.
function classify(v: number): { phase: string; lean: string } {
  if (v >= 0.5) return { phase: "El Niño", lean: "warm" };
  if (v <= -0.5) return { phase: "La Niña", lean: "cool" };
  if (v > 0) return { phase: "Neutral", lean: "warm-leaning" };
  if (v < 0) return { phase: "Neutral", lean: "cool-leaning" };
  return { phase: "Neutral", lean: "neutral" };
}

// Parse a row like " 06MAY2026     26.4 1.6     28.5 1.1     28.8 0.9     29.6 0.9"
// Columns are pairs of (SST, anomaly) for Niño1+2, Niño3, Niño3.4, Niño4.
// Returns Niño 3.4 anomaly (3rd pair) and the week label.
function parseWeekly(text: string): { anom: number; week: string } | null {
  const lines = text.trim().split("\n").filter((l) => /\d{2}[A-Z]{3}\d{4}/.test(l));
  const last = lines[lines.length - 1];
  if (!last) return null;
  const m = last.match(/(\d{2}[A-Z]{3}\d{4})/);
  const week = m ? m[1] : "";
  // Strip date, split remaining numbers.
  const nums = last.replace(/\d{2}[A-Z]{3}\d{4}/, "").trim().split(/\s+/).map(parseFloat);
  // Expect 8 numbers (4 SST + 4 anom). Niño 3.4 anomaly = index 5.
  if (nums.length < 6 || !isFinite(nums[5])) return null;
  return { anom: nums[5], week };
}

// Pretty-print "06MAY2026" -> "May 6, 2026".
function fmtWeek(w: string): string {
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
  if (!res.ok) throw new Error(`CPC weekly ${res.status}`);
  const parsed = parseWeekly(await res.text());
  if (!parsed) throw new Error("weekly parse failed");
  const { phase, lean } = classify(parsed.anom);
  return {
    source: "weekly",
    region: "Niño 3.4",
    oni: parsed.anom,
    phase,
    lean,
    season: `week of ${fmtWeek(parsed.week)}`,
    year: parsed.week.slice(-4),
  };
}

async function fetchMonthly() {
  const res = await fetch(ONI_URL, { headers: { "User-Agent": "StratoOps/1.0" } });
  if (!res.ok) throw new Error(`CPC ONI ${res.status}`);
  const lines = (await res.text()).trim().split("\n").slice(1).filter(Boolean);
  const last = lines[lines.length - 1].trim().split(/\s+/);
  const anom = parseFloat(last[3]);
  if (!isFinite(anom)) throw new Error("ONI parse failed");
  const { phase, lean } = classify(anom);
  return { source: "monthly", region: "ONI", oni: anom, phase, lean, season: last[0], year: last[1] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let payload;
    try {
      payload = await fetchWeekly();
    } catch (e) {
      console.warn("[enso-status] weekly failed, falling back to monthly:", e);
      payload = await fetchMonthly();
    }
    return new Response(JSON.stringify(payload), {
      // Cache 1 hour client-side; weekly file only changes Mondays anyway.
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
