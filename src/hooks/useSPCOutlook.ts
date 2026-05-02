/**
 * useSPCOutlook — polls the NWS SPC Day 1 categorical outlook every 5 minutes
 * and, whenever a new issuance is detected, posts a single automated bot
 * message to the public.messages table summarizing where the risks fall.
 *
 * The bot identity is the reserved profile `00000000-0000-0000-0000-000000000000`
 * (badge "System"), which is allowlisted by RLS, excluded from the 2-hour
 * cron cleanup, and protected from deletion.
 *
 * Behavior summary:
 *   • Fetches SPC Day 1 categorical outlook (GeoJSON FeatureCollection).
 *   • De-duplicates against the most recent ISSUE timestamp held in a ref.
 *     The very first poll after page load only seeds the ref — we do NOT
 *     re-post outlooks that the user has already seen on prior visits.
 *   • Excludes TSTM (general thunderstorm) — too vast to summarize meaningfully.
 *   • Reverse-geocodes each remaining polygon centroid via NWS /points to
 *     produce "{city}, {state}" labels, with a 500ms gap between requests.
 *   • Skips posting if no qualifying risk areas remain.
 *   • Mounted exactly once (via a module-level guard) so multiple consumers
 *     don't trigger duplicate inserts.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SPC_URL =
  "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query?where=1%3D1&outFields=LABEL,LABEL2,ISSUE,EXPIRE&returnGeometry=true&f=geojson";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const REVERSE_GEOCODE_DELAY_MS = 500;
const BOT_USER_ID = "00000000-0000-0000-0000-000000000000";

const RISK_LABELS: Record<string, string> = {
  TSTM: "General Thunderstorm",
  MRGL: "Marginal Risk",
  SLGT: "Slight Risk",
  ENH: "Enhanced Risk",
  MDT: "Moderate Risk",
  HIGH: "High Risk",
};

// Severity rank — higher = more severe. Used to sort the message lines so
// the most significant risks appear first.
const RISK_RANK: Record<string, number> = {
  MRGL: 1,
  SLGT: 2,
  ENH: 3,
  MDT: 4,
  HIGH: 5,
};

// Module-level singleton guard — ensures a single polling loop even if the
// hook is mounted by multiple components or remounted during HMR.
let started = false;

interface SPCFeature {
  properties: { LABEL?: string; LABEL2?: string; ISSUE?: string; EXPIRE?: string };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

interface RiskArea {
  label: string;          // e.g. "SLGT"
  riskLabel: string;      // e.g. "Slight Risk"
  city: string;
  state: string;
}

function formatIssueTime(issue: string): string {
  // ISSUE format: "YYYYMMDD_HHmm" → "Month D, YYYY. HHz"
  const year = issue.slice(0, 4);
  const month = issue.slice(4, 6);
  const day = issue.slice(6, 8);
  const hour = issue.slice(9, 11);
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  const formatted = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatted}. ${hour}z`;
}

// Flatten any polygon/multipolygon ring set to a flat list of [lon, lat] pairs.
function flattenCoords(geom: SPCFeature["geometry"]): number[][] {
  const out: number[][] = [];
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates as number[][][]) {
      for (const pt of ring) out.push(pt);
    }
  } else {
    for (const poly of geom.coordinates as number[][][][]) {
      for (const ring of poly) {
        for (const pt of ring) out.push(pt);
      }
    }
  }
  return out;
}

async function reverseGeocode(lat: number, lon: number): Promise<{ city: string; state: string } | null> {
  try {
    const res = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
      headers: { "User-Agent": "StormCircle/1.0 (bot@stormcircle.net)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rel = data?.properties?.relativeLocation?.properties;
    if (!rel?.city || !rel?.state) return null;
    return { city: rel.city, state: rel.state };
  } catch {
    return null;
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAndProcessOutlook(lastIssueRef: { current: string | null }): Promise<void> {
  let geo: { features: SPCFeature[] };
  try {
    const res = await fetch(SPC_URL);
    if (!res.ok) return;
    geo = await res.json();
  } catch {
    return;
  }

  if (!geo?.features?.length) return;

  // Pick the most recent ISSUE timestamp present in the response.
  const issueTimes = geo.features
    .map((f) => f.properties?.ISSUE)
    .filter((v): v is string => typeof v === "string" && v.length >= 11);
  if (!issueTimes.length) return;
  const latestIssue = issueTimes.sort().reverse()[0];

  // First poll after mount: just seed the baseline so we don't repost an
  // outlook that has been on the page since before the user arrived.
  if (lastIssueRef.current === null) {
    lastIssueRef.current = latestIssue;
    return;
  }

  if (latestIssue === lastIssueRef.current) return; // no new issuance
  lastIssueRef.current = latestIssue;

  // Filter to features matching the new issuance and excluding TSTM.
  const relevant = geo.features.filter((f) => {
    const label = f.properties?.LABEL;
    return f.properties?.ISSUE === latestIssue && label && label !== "TSTM" && RISK_LABELS[label];
  });

  if (!relevant.length) return; // quiet day after filtering — nothing to post

  // Reverse-geocode each polygon centroid sequentially with a 500ms gap.
  const areas: RiskArea[] = [];
  for (const feat of relevant) {
    const coords = flattenCoords(feat.geometry);
    if (!coords.length) continue;
    const lats = coords.map((c) => c[1]);
    const lons = coords.map((c) => c[0]);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;

    const place = await reverseGeocode(centerLat, centerLon);
    await delay(REVERSE_GEOCODE_DELAY_MS);
    if (!place) continue;

    const label = feat.properties.LABEL!;
    areas.push({
      label,
      riskLabel: RISK_LABELS[label],
      city: place.city,
      state: place.state,
    });
  }

  if (!areas.length) return;

  // Sort by severity desc so the most severe risk appears first.
  areas.sort((a, b) => (RISK_RANK[b.label] ?? 0) - (RISK_RANK[a.label] ?? 0));

  const lines = [
    `⚡ SPC Day 1 Outlook Update — ${formatIssueTime(latestIssue)}`,
    ``,
    ...areas.map((a) => `${a.city}, ${a.state} under a ${a.riskLabel}.`),
  ].join("\n");

  // Insert as bot user. The enforce_message_identity DB trigger will pull
  // username/badge from the SPC Bot profile row, so we only need user_id +
  // content here — the other fields are placeholders.
  const { error } = await supabase.from("messages").insert({
    user_id: BOT_USER_ID,
    username: "SPC Bot",
    badge: "System",
    content: lines,
  });
  if (error) {
    // Roll back the ref so we retry on the next poll.
    lastIssueRef.current = null;
    console.warn("[useSPCOutlook] failed to post bot message:", error);
  }
}

export function useSPCOutlook(): void {
  const lastIssueRef = useRef<string | null>(null);

  useEffect(() => {
    if (started) return;
    started = true;

    // Fire immediately on mount, then on a 5-minute cadence.
    void fetchAndProcessOutlook(lastIssueRef);
    const id = setInterval(() => {
      void fetchAndProcessOutlook(lastIssueRef);
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
      started = false;
    };
  }, []);
}
