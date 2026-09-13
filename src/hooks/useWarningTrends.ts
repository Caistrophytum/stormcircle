import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRefreshTick } from "./useRefreshTick";

export type Trend = {
  event: string;
  direction: "up" | "down";
  percent: number;
  today: number;
  average: number;
  label: string;
  color: string;
};

function getBucketDate() {
  const now = new Date();
  return new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getTrendLabelAndColor(percent: number, direction: "up" | "down") {
  const abs = Math.abs(percent);
  if (direction === "up") {
    if (abs >= 25) return { label: "Spiking Upwards", color: "hsl(0, 80%, 55%)" };
    if (abs >= 16) return { label: "Rushing Upwards", color: "hsl(28, 95%, 55%)" };
    return { label: "Trending Upwards", color: "hsl(50, 100%, 55%)" };
  }
  if (abs >= 25) return { label: "Spiking Downwards", color: "hsl(220, 90%, 55%)" };
  if (abs >= 16) return { label: "Rushing Downwards", color: "hsl(175, 90%, 45%)" };
  return { label: "Trending Downwards", color: "hsl(142, 100%, 60%)" };
}

export function useWarningTrends() {
  const tick = useRefreshTick();
  const [rows, setRows] = useState<{ event: string; day: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("warning_daily_counts")
        .select("event, day, count")
        .order("day", { ascending: false });

      if (!cancelled) {
        if (error) {
          console.error("[useWarningTrends] failed to load", error);
        } else {
          setRows(data ?? []);
        }
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const result = useMemo(() => {
    const today = getBucketDate();
    const byEvent: Record<string, { today: number; past: Record<string, number> }> = {};
    const pastDays = new Set<string>();

    for (const r of rows) {
      if (!byEvent[r.event]) {
        byEvent[r.event] = { today: 0, past: {} };
      }
      if (r.day === today) {
        byEvent[r.event].today = r.count;
      } else {
        byEvent[r.event].past[r.day] = r.count;
        pastDays.add(r.day);
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
      const { label, color } = getTrendLabelAndColor(percent, direction);

      trends.push({
        event,
        direction,
        percent,
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
  }, [rows, loading]);

  return result;
}
