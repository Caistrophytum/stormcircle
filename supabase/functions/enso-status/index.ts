// Edge function: fetches NOAA CPC's ONI (Oceanic Niño Index) ASCII file and
// returns the latest 3-month ONI value plus a phase classification. Proxied
// server-side because cpc.ncep.noaa.gov does not send CORS headers.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";

// Standard CPC thresholds: |ONI| >= 0.5 sustained = El Niño / La Niña.
// We classify on the latest single 3-month value (good enough for a chat line).
function classify(oni: number): { phase: string; lean: string } {
  if (oni >= 0.5) return { phase: "El Niño", lean: "warm" };
  if (oni <= -0.5) return { phase: "La Niña", lean: "cool" };
  if (oni > 0) return { phase: "Neutral", lean: "warm-leaning" };
  if (oni < 0) return { phase: "Neutral", lean: "cool-leaning" };
  return { phase: "Neutral", lean: "neutral" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const res = await fetch(ONI_URL, { headers: { "User-Agent": "StratoOps/1.0" } });
    if (!res.ok) throw new Error(`CPC ${res.status}`);
    const text = await res.text();
    // File format: header line + rows like "SEAS  YR  TOTAL  ANOM"
    // e.g. "DJF  1950  24.72 -1.53"
    const lines = text.trim().split("\n").slice(1).filter(Boolean);
    const last = lines[lines.length - 1];
    const parts = last.trim().split(/\s+/);
    const seas = parts[0];
    const year = parts[1];
    const anom = parseFloat(parts[3]);
    if (!isFinite(anom)) throw new Error("parse failed");
    const { phase, lean } = classify(anom);
    return new Response(
      JSON.stringify({ season: seas, year, oni: anom, phase, lean }),
      { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=21600" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
