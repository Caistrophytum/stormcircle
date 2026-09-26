import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRefreshTick } from "./useRefreshTick";

export type TrendRegion = "all" | "US" | "EU";

export type Trend = {
  event: string;
  region: TrendRegion;
  direction: "up" | "down";
  percent: number;
  level: "low" | "medium" | "high";
  today: number;
  average: number;
  label: string;
  color: string;
};

type CountRow = {
  event: string;
  day: string;
  count: number;
  region: string;
  updated_at: string | null;
};

function getBucketDate() {
  const now = new Date();
  return new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Start of the current 12Z-to-12Z bucket, as an ISO timestamp. */
function getBucketStart() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0),
  );
  if (start.getTime() > now.getTime()) start.setUTCDate(start.getUTCDate() - 1);
  return start.toISOString();
}

function regionOf(alertId: string) {
  return alertId.startsWith("MA-") ? "EU" : "US";
}

function isWarningEvent(event: string) {
  const e = event.toLowerCase();
  return (
    e.includes("warning") ||
    e.includes("watch") ||
    e.includes("emergency") ||
    e.includes("evacuation") ||
    e.includes("shelter")
  );
}

// Wording thresholds are direction-specific: upward trends follow the
// low/medium/high magnitude levels (up to 50%, up to 150%, above 150%),
// downward trends use the steeper decline ladder (up to 30%, up to 60%,
// beyond 60%).
function getTrendWord(abs: number, direction: "up" | "down") {
  if (direction === "up") {
    return abs > 150 ? "Spiking" : abs > 50 ? "Rushing" : "Trending";
  }
  return abs > 60 ? "Spiking" : abs > 30 ? "Rushing" : "Trending";
}

function getTrendLabel(percent: number, direction: "up" | "down") {
  return `${getTrendWord(Math.abs(percent), direction)} ${direction === "up" ? "Upwards" : "Downwards"}`;
}

function getLevelColor(level: Trend["level"], direction: "up" | "down") {
  if (direction === "up") {
    if (level === "high") return "hsl(0, 80%, 55%)";
    if (level === "medium") return "hsl(28, 95%, 55%)";
    return "hsl(50, 100%, 55%)";
  }
  if (level === "high") return "hsl(220, 85%, 42%)";
  if (level === "medium") return "hsl(175, 90%, 45%)";
  return "hsl(142, 100%, 60%)";
}

/** Magnitude level thresholds, direction-specific (percent is absolute). */
function getTrendLevel(abs: number, direction: "up" | "down"): Trend["level"] {
  if (direction === "up") {
    return abs <= 50 ? "low" : abs <= 150 ? "medium" : "high";
  }
  return abs <= 30 ? "low" : abs <= 60 ? "medium" : "high";
}

export function useWarningTrends(region: TrendRegion = "all") {
  const tick = useRefreshTick();
  const [rows, setRows] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Locally recompiled counts for today's bucket, keyed "event|REGION",
  // tagged with the bucket day they were compiled for.
  const [localToday, setLocalToday] = useState<{
    day: string;
    counts: Record<string, number>;
  } | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Timestamp of the latest manual compilation. Read through a ref inside the
  // load effect so a periodic refresh can tell whether the server rollup has
  // genuinely superseded the manual snapshot (newer updated_at for today's
  // bucket) or is just re-delivering the same older numbers.
  const manualAtRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("warning_daily_counts")
        .select("event, day, count, region, updated_at")
        .order("day", { ascending: false });

      if (!cancelled) {
        if (error) {
          console.error("[useWarningTrends] failed to load", error);
        } else {
          const loaded = (data ?? []) as CountRow[];
          setRows(loaded);
          // Keep a manual snapshot until the server rollup for today's bucket
          // is newer than the manual compilation itself. The hourly rollup can
          // rewrite rows without moving their data forward, so clearing on
          // every periodic refresh would silently throw the manual update away
          // within a minute while the button still shows its timestamp.
          const today = getBucketDate();
          const serverToday = loaded.reduce((max, r) => {
            if (r.day !== today) return max;
            const t = r.updated_at ? Date.parse(r.updated_at) : NaN;
            return Number.isFinite(t) && t > max ? t : max;
          }, 0);
          const newest = loaded.reduce((max, r) => {
            const t = r.updated_at ? Date.parse(r.updated_at) : NaN;
            return Number.isFinite(t) && t > max ? t : max;
          }, 0);
          if (manualAtRef.current !== null && serverToday > manualAtRef.current) {
            manualAtRef.current = null;
            setLocalToday(null);
            if (newest > 0) setLastUpdatedAt(newest);
          } else if (newest > 0) {
            setLastUpdatedAt((prev) => (prev && prev > newest ? prev : newest));
          }
        }
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  /**
   * Recompile today's running counts straight from the live alert table,
   * without waiting for the hourly server rollup. Averages still come from
   * the stored daily buckets.
   */
  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from("active_alerts")
        .select("alert_id, event, first_seen_at")
        .gte("first_seen_at", getBucketStart());
      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as {
        alert_id: string; event: string | null; first_seen_at: string;
      }[]) {
        if (!row.event || !isWarningEvent(row.event)) continue;
        const key = `${row.event}|${regionOf(row.alert_id)}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      setLocalToday({ day: getBucketDate(), counts });
      manualAtRef.current = Date.now();
      setLastUpdatedAt(Date.now());
    } catch (err) {
      console.error("[useWarningTrends] manual refresh failed", err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const result = useMemo(() => {
    const today = getBucketDate();
    const byEvent: Record<string, { today: number; past: Record<string, number> }> = {};
    const pastDays = new Set<string>();

    const matches = (r: CountRow) => region === "all" || r.region === region;

    for (const r of rows) {
      if (!matches(r)) continue;
      if (!byEvent[r.event]) byEvent[r.event] = { today: 0, past: {} };
      if (r.day === today) {
        byEvent[r.event].today += r.count;
      } else {
        byEvent[r.event].past[r.day] = (byEvent[r.event].past[r.day] ?? 0) + r.count;
        pastDays.add(r.day);
      }
    }

    // A manual update replaces today's stored counts with freshly compiled ones,
    // but only while it belongs to the current bucket day.
    if (localToday && localToday.day === today) {
      for (const key of Object.keys(byEvent)) byEvent[key].today = 0;
      for (const [key, count] of Object.entries(localToday.counts)) {
        const sep = key.lastIndexOf("|");
        const event = key.slice(0, sep);
        const rowRegion = key.slice(sep + 1);
        if (region !== "all" && rowRegion !== region) continue;
        if (!byEvent[event]) byEvent[event] = { today: 0, past: {} };
        byEvent[event].today += count;
      }
    }

    const trends: Trend[] = [];

    for (const [event, data] of Object.entries(byEvent)) {
      const pastEntries = Object.entries(data.past)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 3);

      if (pastEntries.length < 3) continue;

      const average = pastEntries.reduce((sum, [, count]) => sum + count, 0) / 3;
      if (average === 0) continue;

      const diff = data.today - average;
      const percent = Math.round((diff / average) * 100);

      if (Math.abs(percent) < 10 || Math.abs(diff) < 3) continue;

      const direction = diff > 0 ? "up" : "down";
      const abs = Math.abs(percent);
      const level = getTrendLevel(abs, direction);
      const label = getTrendLabel(percent, direction);
      const color = getLevelColor(level, direction);

      trends.push({
        event,
        region,
        direction,
        percent,
        level,
        today: data.today,
        average: Math.round(average),
        label,
        color,
      });
    }

    trends.sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent));

    return {
      today,
      pastDayCount: pastDays.size,
      trends,
      loading,
      collecting: pastDays.size < 3,
      steady: pastDays.size >= 3 && trends.length === 0,
    };
  }, [rows, loading, region, localToday]);

  return { ...result, refreshNow, refreshing, lastUpdatedAt };
}
