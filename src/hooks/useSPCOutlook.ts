/**
 * useSPCOutlook — polls the NWS SPC Day 1 categorical outlook every 5 minutes
 * and keeps a single automated bot message in the chat that always reflects
 * the *most recent* outlook issuance.
 *
 * Behaviour:
 *   • First poll on mount: read the existing SPC Bot message (if any) from
 *     the database. Compare its embedded ISSUE timestamp to the latest one
 *     coming from SPC. If SPC has something newer (or there's no bot
 *     message at all), replace the old bot message with a fresh one so
 *     users who just loaded the page see the current outlook.
 *   • Every subsequent poll: when SPC's ISSUE timestamp changes, delete the
 *     prior bot message(s) and post the new one. This keeps a single,
 *     up-to-date "Latest Outlook" pinned at the top of the chat.
 *   • TSTM (general thunderstorm) is excluded from summaries — it covers
 *     huge areas and would produce a wall of text. If only TSTM is in
 *     play, no message is posted (and any existing bot message is left
 *     in place since SPC still considers the prior outlook "current").
 *   • Reverse geocodes each remaining polygon centroid via NWS /points
 *     with a 500ms gap to respect rate limits.
 *
 * The bot identity is the reserved profile `00000000-0000-0000-0000-000000000000`
 * (badge "System"), allowlisted by RLS to insert/delete its own messages
 * without an authenticated session, and excluded from the 2h cron cleanup.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SPC_URL =
  "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query?where=1%3D1&outFields=LABEL,LABEL2,ISSUE,EXPIRE&returnGeometry=true&f=geojson";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const REVERSE_GEOCODE_DELAY_MS = 500;
const BOT_USER_ID = "00000000-0000-0000-0000-000000000000";

// Marker embedded in the bot message so we can recover the originating
// ISSUE timestamp + structured payload from the persisted row on later
// page loads. Hidden in HTML comments so they don't visually clutter the
// rendered text.
// SPC ISSUE format is "YYYYMMDDHHmm" (12 digits, no separator).
const ISSUE_MARKER_RE = /<!--issue:(\d{12})-->/;
const DATA_MARKER_RE = /<!--data:([\s\S]*?)-->/;
// Cap reverse-geocode calls per polygon to keep total API usage bounded
// even when the SPC issues a large outlook.
const MAX_SAMPLES_PER_POLYGON = 12;

const RISK_LABELS: Record<string, string> = {
  TSTM: "General Thunderstorm",
  MRGL: "Marginal Risk",
  SLGT: "Slight Risk",
  ENH: "Enhanced Risk",
  MDT: "Moderate Risk",
  HIGH: "High Risk",
};

// Severity rank — higher = more severe. Used to sort message lines so the
// most significant risks appear first.
const RISK_RANK: Record<string, number> = {
  MRGL: 1,
  SLGT: 2,
  ENH: 3,
  MDT: 4,
  HIGH: 5,
};

// Module-level singleton guard so HMR / multiple mounts don't spawn
// parallel polling loops.
let started = false;

// Tiny pub/sub for the "currently fetching outlook" flag so any component
// (regardless of where the polling hook is mounted) can subscribe.
let loadingState = false;
const loadingSubs = new Set<(v: boolean) => void>();
function setLoadingShared(v: boolean) {
  loadingState = v;
  loadingSubs.forEach((fn) => fn(v));
}

interface SPCFeature {
  properties: { label?: string; label2?: string; issue?: string; expire?: string };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

interface RiskCounty {
  county: string;
  state: string;
}

interface RiskGroup {
  label: string;
  riskLabel: string;
  counties: RiskCounty[]; // already deduped + sorted
}

function formatIssueTime(issue: string): string {
  // ISSUE format: "YYYYMMDDHHmm" → "Month D, YYYY. HHz"
  const year = issue.slice(0, 4);
  const month = issue.slice(4, 6);
  const day = issue.slice(6, 8);
  const hour = issue.slice(8, 10);
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  const formatted = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatted}. ${hour}z`;
}

/** Standard ray-casting point-in-polygon for [lon, lat] rings. */
function pointInRing(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(pt: [number, number], geom: SPCFeature["geometry"]): boolean {
  const polys =
    geom.type === "Polygon"
      ? [geom.coordinates as number[][][]]
      : (geom.coordinates as number[][][][]);
  for (const poly of polys) {
    if (!poly.length) continue;
    if (!pointInRing(pt, poly[0])) continue;
    // Subtract holes
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(pt, poly[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

function bbox(geom: SPCFeature["geometry"]): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const visit = (rings: number[][][]) => {
    for (const ring of rings)
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  };
  if (geom.type === "Polygon") visit(geom.coordinates as number[][][]);
  else for (const poly of geom.coordinates as number[][][][]) visit(poly);
  return [minX, minY, maxX, maxY];
}

/** Sample up to MAX_SAMPLES_PER_POLYGON points inside the polygon via a
 *  grid over its bounding box, filtered by point-in-polygon. */
function samplePointsInside(geom: SPCFeature["geometry"]): [number, number][] {
  const [minX, minY, maxX, maxY] = bbox(geom);
  // Choose grid density so we get up to ~MAX_SAMPLES candidate cells.
  const grid = Math.max(3, Math.ceil(Math.sqrt(MAX_SAMPLES_PER_POLYGON * 2)));
  const out: [number, number][] = [];
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const x = minX + ((maxX - minX) * (i + 0.5)) / grid;
      const y = minY + ((maxY - minY) * (j + 0.5)) / grid;
      if (pointInGeometry([x, y], geom)) out.push([x, y]);
    }
  }
  // If too many, evenly downsample.
  if (out.length > MAX_SAMPLES_PER_POLYGON) {
    const step = out.length / MAX_SAMPLES_PER_POLYGON;
    const sampled: [number, number][] = [];
    for (let k = 0; k < MAX_SAMPLES_PER_POLYGON; k++) {
      sampled.push(out[Math.floor(k * step)]);
    }
    return sampled;
  }
  return out;
}

/** Reverse-geocode to a county + state using the NWS /points endpoint.
 *  Returns null if NWS doesn't cover the point (outside US). */
async function reverseGeocodeCounty(
  lat: number,
  lon: number,
): Promise<{ county: string; state: string } | null> {
  try {
    const res = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { "User-Agent": "StormCircle/1.0 (bot@stormcircle.net)" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const props = data?.properties;
    const state: string | undefined = props?.relativeLocation?.properties?.state;
    // `county` is a URL like ".../zones/county/FLC123" — fetch the zone for
    // its human-readable name.
    const countyUrl: string | undefined = props?.county;
    if (!state || !countyUrl) return null;
    const zoneRes = await fetch(countyUrl, {
      headers: { "User-Agent": "StormCircle/1.0 (bot@stormcircle.net)" },
    });
    if (!zoneRes.ok) return null;
    const zone = await zoneRes.json();
    const name: string | undefined = zone?.properties?.name;
    if (!name) return null;
    return { county: name, state };
  } catch {
    return null;
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read the most-recent persisted bot message and return the ISSUE timestamp
 * embedded in it (or null if none exists / the marker is absent).
 */
async function getStoredIssue(): Promise<string | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("content")
    .eq("user_id", BOT_USER_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const m = data.content.match(ISSUE_MARKER_RE);
  return m ? m[1] : null;
}

/**
 * Build the message body for a given issuance + risk groups.
 * Embeds two HTML-comment markers:
 *   • <!--issue:...-->  ISSUE timestamp recovery
 *   • <!--data:...-->   structured JSON payload (rendered by the UI as
 *     expandable per-risk dropdowns of affected counties).
 *
 * The plain-text fallback (visible if a client doesn't parse the data
 * marker) summarizes the same info as a one-line-per-risk list.
 */
function buildMessage(issue: string, groups: RiskGroup[]): string {
  const summary = groups.map(
    (g) => `${g.riskLabel}: ${g.counties.length} ${g.counties.length === 1 ? "county" : "counties"}`,
  );
  const payload = JSON.stringify({ issue, groups });
  const lines = [
    `⚡ SPC Day 1 Outlook Update — ${formatIssueTime(issue)}`,
    ``,
    ...summary,
    `<!--issue:${issue}-->`,
    `<!--data:${payload}-->`,
  ];
  return lines.join("\n");
}

async function fetchAndProcessOutlook(
  lastIssueRef: { current: string | null },
  setLoading: (v: boolean) => void,
): Promise<void> {
  setLoading(true);
  try {
    let geo: { features: SPCFeature[] };
    try {
      const res = await fetch(SPC_URL);
      if (!res.ok) return;
      geo = await res.json();
    } catch {
      return;
    }
    if (!geo?.features?.length) return;

    const issueTimes = geo.features
      .map((f) => f.properties?.issue)
      .filter((v): v is string => typeof v === "string" && v.length >= 12);
    if (!issueTimes.length) return;
    const latestIssue = issueTimes.sort().reverse()[0];

    // First poll after mount: reconcile against whatever's already in the DB
    // so a user who just opened the page still sees the current outlook.
    if (lastIssueRef.current === null) {
      const stored = await getStoredIssue();
      if (stored && stored >= latestIssue) {
        // DB already has the latest (or newer) — nothing to do.
        lastIssueRef.current = stored;
        return;
      }
      // Stored is older or missing — fall through and (re)post.
    } else if (latestIssue === lastIssueRef.current) {
      return; // no new issuance since we last posted
    }

    // Filter to the latest issuance and exclude TSTM.
    const relevant = geo.features.filter((f) => {
      const label = f.properties?.label;
      return f.properties?.issue === latestIssue && label && label !== "TSTM" && RISK_LABELS[label];
    });
    if (!relevant.length) {
      // Quiet day at the new issuance — record the timestamp so we don't
      // re-evaluate it again, but don't post or wipe an existing bot row.
      lastIssueRef.current = latestIssue;
      return;
    }

    // For each relevant risk polygon, sample multiple interior points and
    // resolve them to (county, state) pairs via the NWS /points endpoint.
    // Dedupe per polygon so each county appears at most once per risk tier.
    const groups: RiskGroup[] = [];
    for (const feat of relevant) {
      const samples = samplePointsInside(feat.geometry);
      if (!samples.length) continue;

      const seen = new Set<string>();
      const counties: RiskCounty[] = [];
      for (const [lon, lat] of samples) {
        const place = await reverseGeocodeCounty(lat, lon);
        await delay(REVERSE_GEOCODE_DELAY_MS);
        if (!place) continue;
        const key = `${place.county}|${place.state}`;
        if (seen.has(key)) continue;
        seen.add(key);
        counties.push(place);
      }
      if (!counties.length) continue;
      counties.sort((a, b) =>
        a.state === b.state ? a.county.localeCompare(b.county) : a.state.localeCompare(b.state),
      );

      const label = feat.properties.label!;
      groups.push({ label, riskLabel: RISK_LABELS[label], counties });
    }
    if (!groups.length) {
      lastIssueRef.current = latestIssue;
      return;
    }

    groups.sort((a, b) => (RISK_RANK[b.label] ?? 0) - (RISK_RANK[a.label] ?? 0));
    const content = buildMessage(latestIssue, groups);

    // Replace any existing bot messages with the new one. Delete-then-insert
    // (rather than UPDATE) because the messages table is append-only by
    // policy and Realtime subscribers expect INSERT events for fresh rows.
    const { error: delErr } = await supabase.from("messages").delete().eq("user_id", BOT_USER_ID);
    if (delErr) {
      console.warn("[useSPCOutlook] failed to clear previous bot message:", delErr);
    }

    const { error: insErr } = await supabase.from("messages").insert({
      user_id: BOT_USER_ID,
      username: "SPC Bot",
      badge: "System",
      content,
    });
    if (insErr) {
      lastIssueRef.current = null;
      console.warn("[useSPCOutlook] failed to post bot message:", insErr);
      return;
    }
    lastIssueRef.current = latestIssue;
  } finally {
    setLoading(false);
  }
}

export function useSPCOutlook(): void {
  const lastIssueRef = useRef<string | null>(null);

  useEffect(() => {
    if (started) return;
    started = true;

    void fetchAndProcessOutlook(lastIssueRef, setLoadingShared);
    const id = setInterval(() => {
      void fetchAndProcessOutlook(lastIssueRef, setLoadingShared);
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
      started = false;
    };
  }, []);
}

/**
 * Subscribe to the SPC bot's "currently fetching" flag from anywhere in
 * the tree. Flips true while the hook is reverse-geocoding a new
 * outlook, false otherwise.
 */
export function useSPCOutlookLoading(): boolean {
  const [loading, setLoading] = useState(loadingState);
  useEffect(() => {
    setLoading(loadingState);
    loadingSubs.add(setLoading);
    return () => {
      loadingSubs.delete(setLoading);
    };
  }, []);
  return loading;
}
