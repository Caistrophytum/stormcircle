/**
 * useHurricaneBot — posts automated tropical-cyclone updates to the chat
 * under the reserved Hurricane Bot identity (00000000-0000-0000-0000-000000000001).
 *
 * Three message types:
 *   1. Season status: posted once per app load if the latest persisted
 *      season-status message is older than 6 hours (or absent).
 *   2. Advisory update: posted when a storm's `lastUpdate` changes.
 *   3. Dangerous-storm detail: posted alongside (2) for HU/TY/STY or
 *      intensity >= 50 kt.
 *
 * The hook is intentionally side-effect-only (returns void). Mount it once
 * at app root.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHurricaneData, type Storm } from "./useHurricaneData";

const HURRICANE_BOT_ID = "00000000-0000-0000-0000-000000000001";

// Hidden marker so we can detect/identify previously-posted season-status
// rows without showing implementation noise to users.
const STATUS_MARKER = "<!--htype:season-->";
const ADVISORY_MARKER_RE = (stormId: string, ts: string) =>
  `<!--hadv:${stormId}:${ts}-->`;

// Module-level guard so HMR / multiple mounts don't double-post.
let started = false;

/** Format the "Last advisory" timestamp shown in the season-status card. */
function formatAdvisoryTime(d: Date): string {
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hour = String(d.getUTCHours()).padStart(2, "0");
  return `${month} ${day}, ${year}. ${hour}z`;
}

/**
 * Build the body of an advisory-update card.
 * `isNew = true` switches the header to "NEW STORM" the first time we see
 * a given storm id; otherwise it's an "ADVISORY UPDATE" for an existing one.
 * The trailing <!--hadv:--> marker lets us recover state on refresh so a
 * page reload doesn't re-post identical advisories.
 */
function formatAdvisoryMessage(storm: Storm, isNew: boolean): string {
  const header = isNew
    ? `🌀 NEW STORM: ${storm.name} — ${storm.classificationLabel}`
    : `🌀 ADVISORY UPDATE: ${storm.name}`;
  return [
    header,
    ``,
    `Classification: ${storm.classificationLabel}`,
    `Location: ${storm.latStr}, ${storm.lonStr}`,
    `Max Winds: ${storm.intensityMph} mph (${storm.intensity} kt)`,
    `Pressure: ${storm.pressure} mb`,
    // Movement speed comes from NHC in knots; convert to mph for the public.
    `Movement: ${storm.movementDirCompass} at ${Math.round(storm.movementSpeed * 1.151)} mph`,
    ``,
    // Prefer the visual forecast graphic for dangerous storms (more useful
    // at a glance); fall back to the text public advisory otherwise.
    storm.isDangerous && storm.forecastGraphicsUrl
      ? `⚠️ DANGEROUS STORM — See forecast: ${storm.forecastGraphicsUrl}`
      : storm.advisoryUrl
        ? `Advisory: ${storm.advisoryUrl}`
        : ``,
    ADVISORY_MARKER_RE(storm.id, storm.lastUpdate.toISOString()),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build the body of the additional danger-detail card posted alongside the
 * advisory for hurricane-tier or strong-TS storms. Links the forecaster
 * discussion + graphics so users can dig deeper without leaving the chat.
 * The `:danger` suffix on the marker storm id distinguishes it from the
 * matching advisory row during hydration.
 */
function formatDangerMessage(storm: Storm): string {
  return [
    `🔴 ${storm.dangerLevel}: ${storm.name.toUpperCase()}`,
    ``,
    `Winds: ${storm.intensityMph} mph — Pressure: ${storm.pressure} mb`,
    `Current position: ${storm.latStr}, ${storm.lonStr}`,
    `Moving: ${storm.movementDirCompass} at ${Math.round(storm.movementSpeed * 1.151)} mph`,
    ``,
    storm.discussionUrl ? `📊 Forecast discussion: ${storm.discussionUrl}` : ``,
    storm.forecastGraphicsUrl ? `🗺️ Forecast graphics: ${storm.forecastGraphicsUrl}` : ``,
    ADVISORY_MARKER_RE(storm.id + ":danger", storm.lastUpdate.toISOString()),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Insert a Hurricane Bot row. RLS allows anon inserts under the reserved
 * Hurricane Bot UUID; the System badge keeps the row out of the 2-hour
 * cleanup cron.
 */
async function postBotMessage(content: string): Promise<void> {
  const { error } = await supabase.from("messages").insert({
    user_id: HURRICANE_BOT_ID,
    username: "Hurricane Bot",
    badge: "System",
    content,
  });
  if (error) console.warn("[useHurricaneBot] insert failed:", error);
}

/**
 * Fetch the current ENSO phase (El Niño / La Niña / Neutral) from our
 * `enso-status` edge function, which proxies NOAA CPC's ONI ASCII file.
 * Returns a single human-readable line, or null on failure (the season
 * status card is still posted without the ENSO line in that case).
 */
async function fetchEnsoLine(): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("enso-status");
    if (error || !data || typeof data.oni !== "number") return null;
    const sign = data.oni > 0 ? "+" : "";
    return `ENSO: ${data.phase} (${data.lean}, ONI ${sign}${data.oni.toFixed(2)} °C, ${data.season} ${data.year})`;
  } catch {
    return null;
  }
}

async function maybePostSeasonStatus(
  season: { active: boolean; basin: string },
  storms: Storm[],
  lastAdvisory: Date | null,
): Promise<void> {
  // Look up the most recent season-status message; only repost if none
  // exists or the existing one is older than 6 hours.
  const { data } = await supabase
    .from("messages")
    .select("id, content, created_at")
    .eq("user_id", HURRICANE_BOT_ID)
    .ilike("content", `%${STATUS_MARKER}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    const ageMs = Date.now() - new Date(data.created_at).getTime();
    if (ageMs < 6 * 60 * 60 * 1000) return;
    // Delete the stale one before posting a fresh status row.
    await supabase.from("messages").delete().eq("id", data.id);
  }

  const ensoLine = await fetchEnsoLine();

  let body: string;
  if (!season.active && storms.length === 0) {
    body = [
      `🌀 HURRICANE SEASON STATUS`,
      ``,
      `No active hurricane seasons at this time.`,
      `No active tropical cyclones.`,
      ensoLine ?? ``,
      STATUS_MARKER,
    ].filter(Boolean).join("\n");
  } else {
    body = [
      `🌀 HURRICANE SEASON STATUS`,
      ``,
      `${season.basin} season is ${season.active ? "ACTIVE" : "INACTIVE"}.`,
      `Current active storms: ${storms.length}`,
      lastAdvisory ? `Last advisory: ${formatAdvisoryTime(lastAdvisory)}` : `Last advisory: —`,
      ensoLine ?? ``,
      STATUS_MARKER,
    ].filter(Boolean).join("\n");
  }

  await postBotMessage(body);
}

export function useHurricaneBot(): void {
  const data = useHurricaneData();
  // Per-storm last advisory timestamp (ISO) seen so we don't double-post when
  // React re-runs effects with the same `storms` array.
  const lastAdvisoryByStorm = useRef<Map<string, string>>(new Map());
  // Storm ids we've already announced — drives the "NEW STORM" vs
  // "ADVISORY UPDATE" header on subsequent posts.
  const seenStormIds = useRef<Set<string>>(new Set());
  // One-shot guard: post the season-status card at most once per app session.
  const seasonStatusPosted = useRef(false);
  // One-shot guard: the hydration query below should only run once per mount.
  const hydrated = useRef(false);

  // Hydrate per-storm state from existing bot rows so a refresh doesn't
  // re-announce storms whose advisory marker is already persisted in chat.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    (async () => {
      const { data: rows } = await supabase
        .from("messages")
        .select("content")
        .eq("user_id", HURRICANE_BOT_ID)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!rows) return;
      // Marker format: <!--hadv:STORMID[:danger]:ISO_TIMESTAMP-->
      // ISO timestamps contain dashes, so we accept any non-greedy tail.
      const advRe = /<!--hadv:([^:]+):([^-]+(?:-[^-]+)*)-->/g;
      for (const r of rows) {
        let m: RegExpExecArray | null;
        while ((m = advRe.exec(r.content)) !== null) {
          // Strip the optional ":danger" suffix so the advisory + danger
          // rows for the same storm collapse to a single key.
          const sid = m[1].replace(/:danger$/, "");
          const ts = m[2];
          const prev = lastAdvisoryByStorm.current.get(sid);
          if (!prev || ts > prev) lastAdvisoryByStorm.current.set(sid, ts);
          seenStormIds.current.add(sid);
        }
      }
    })();
  }, []);

  // Module-level singleton guard so HMR / multiple mounts of <Index/> don't
  // run two parallel polling loops in the same browser tab.
  useEffect(() => {
    if (started) return;
    started = true;
  }, []);

  // Post the season-status card exactly once after the first NHC fetch
  // resolves. `maybePostSeasonStatus` enforces the 6-hour repost throttle
  // against the database so multiple tabs don't all post duplicates.
  useEffect(() => {
    if (seasonStatusPosted.current) return;
    if (data.loading) return;
    seasonStatusPosted.current = true;
    void maybePostSeasonStatus(data.season, data.storms, data.lastAdvisory);
  }, [data.loading, data.season, data.storms, data.lastAdvisory]);

  // Post advisory / danger messages whenever a storm's `lastUpdate` changes.
  // The 500ms delay gives the hydration query above a chance to populate
  // `seenStormIds` so an existing storm doesn't get re-announced as NEW on
  // the very first render.
  useEffect(() => {
    if (data.loading) return;
    const t = setTimeout(() => {
      for (const storm of data.storms) {
        const iso = storm.lastUpdate.toISOString();
        const prev = lastAdvisoryByStorm.current.get(storm.id);
        if (prev === iso) continue;

        const isNew = !seenStormIds.current.has(storm.id);
        seenStormIds.current.add(storm.id);
        lastAdvisoryByStorm.current.set(storm.id, iso);

        // Always post the advisory; only post the extra danger card for
        // hurricane-tier / strong-TS storms (see Storm.isDangerous).
        void postBotMessage(formatAdvisoryMessage(storm, isNew));
        if (storm.isDangerous) {
          void postBotMessage(formatDangerMessage(storm));
        }
      }
    }, 500);
    return () => clearTimeout(t);
  }, [data.loading, data.storms]);
}
