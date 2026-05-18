import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Severity = "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
export type AlertKind = "Warning" | "Watch" | "Advisory" | "Statement" | "Emergency" | "Other";
export type Certainty = "Observed" | "Likely" | "Possible" | "Unlikely" | "Unknown";
export type Urgency = "Immediate" | "Expected" | "Future" | "Past" | "Unknown";

export interface Alert {
  event: string;
  severity: Severity;
  headline: string;
  areaDesc: string;
  kind: AlertKind;
  certainty: Certainty;
  urgency: Urgency;
  tags: string[];
}

export interface TopHazard {
  event: string;
  count: number;
}

export interface NewWarning {
  event: string;
  count: number;
}

export interface AlertsData {
  mostDangerous: Alert[];
  topHazards: TopHazard[];
  /**
   * Warnings whose `first_seen_at` (set server-side by alerts-poll the first
   * time the alert was observed) is within the last NEW_WINDOW_MS. This is
   * the server-backed replacement for the old in-browser "last 5 refresh
   * cycles" tracking, so it works even when no client is online.
   */
  newWarnings: NewWarning[];
  recentAlerts: Alert[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

// alerts-poll runs every 1 minute, so 5 cycles ≈ 5 minutes.
const NEW_WINDOW_MS = 5 * 60_000;

const SEVERITY_ORDER: Record<Severity, number> = {
  Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4,
};
const VALID_SEVERITIES: Severity[] = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];
const VALID_CERTAINTY: Certainty[] = ["Observed", "Likely", "Possible", "Unlikely", "Unknown"];
const VALID_URGENCY: Urgency[] = ["Immediate", "Expected", "Future", "Past", "Unknown"];

function normalizeSeverity(s: unknown): Severity {
  return VALID_SEVERITIES.includes(s as Severity) ? (s as Severity) : "Unknown";
}
function normalizeCertainty(s: unknown): Certainty {
  return VALID_CERTAINTY.includes(s as Certainty) ? (s as Certainty) : "Unknown";
}
function normalizeUrgency(s: unknown): Urgency {
  return VALID_URGENCY.includes(s as Urgency) ? (s as Urgency) : "Unknown";
}

function deriveKind(event: string): AlertKind {
  const e = event.toLowerCase();
  if (e.includes("emergency")) return "Emergency";
  if (e.includes("warning")) return "Warning";
  if (e.includes("watch")) return "Watch";
  if (e.includes("advisory")) return "Advisory";
  if (e.includes("statement")) return "Statement";
  return "Other";
}

function extractTags(props: Record<string, any>): string[] {
  const tags: string[] = [];
  const haystack = [
    props.headline,
    props.description,
    props.event,
    props.parameters?.tornadoDamageThreatTag,
    props.parameters?.thunderstormDamageThreatTag,
    props.parameters?.flashFloodDamageThreatTag,
    Array.isArray(props.parameters?.NWSheadline)
      ? props.parameters.NWSheadline.join(" ")
      : props.parameters?.NWSheadline,
  ].filter(Boolean).map((v: any) => String(v).toLowerCase()).join(" ");

  if (/particularly dangerous situation|\bpds\b/.test(haystack)) tags.push("PDS");
  if (/tornado emergency/.test(haystack)) tags.push("Tornado Emergency");
  if (/flash flood emergency/.test(haystack)) tags.push("Flash Flood Emergency");
  if (/\bdestructive\b/.test(haystack)) tags.push("Destructive");
  if (/\bconsiderable\b/.test(haystack)) tags.push("Considerable");
  if (/\bcatastrophic\b/.test(haystack)) tags.push("Catastrophic");

  return Array.from(new Set(tags));
}

const KIND_ORDER: Record<AlertKind, number> = {
  Emergency: 0, Warning: 1, Watch: 2, Advisory: 3, Statement: 4, Other: 5,
};
const CERTAINTY_ORDER: Record<Certainty, number> = {
  Observed: 0, Likely: 1, Possible: 2, Unlikely: 3, Unknown: 4,
};
const URGENCY_ORDER: Record<Urgency, number> = {
  Immediate: 0, Expected: 1, Future: 2, Past: 3, Unknown: 4,
};

function dangerScore(a: Alert): number {
  let tagTier = 4;
  if (a.tags.includes("Tornado Emergency") || a.tags.includes("Flash Flood Emergency")) tagTier = 0;
  else if (a.tags.includes("PDS") || a.tags.includes("Catastrophic")) tagTier = 1;
  else if (a.tags.includes("Destructive")) tagTier = 2;
  else if (a.tags.includes("Considerable")) tagTier = 3;

  const isExtreme = a.severity === "Extreme" ? 0 : 1;
  return (
    KIND_ORDER[a.kind] * 10_000_000 +
    isExtreme * 1_000_000 +
    tagTier * 100_000 +
    SEVERITY_ORDER[a.severity] * 1_000 +
    CERTAINTY_ORDER[a.certainty] * 10 +
    URGENCY_ORDER[a.urgency]
  );
}

interface Row {
  alert_id: string;
  event: string | null;
  severity: string | null;
  certainty: string | null;
  urgency: string | null;
  headline: string | null;
  area_desc: string | null;
  first_seen_at: string | null;
  properties: any;
}

function rowToAlert(r: Row): Alert {
  const event = r.event ?? "Unknown";
  const params = r.properties?.parameters ?? {};
  return {
    event,
    severity: normalizeSeverity(r.severity),
    headline: r.headline ?? "",
    areaDesc: r.area_desc ?? "",
    kind: deriveKind(event),
    certainty: normalizeCertainty(r.certainty),
    urgency: normalizeUrgency(r.urgency),
    tags: extractTags({
      headline: r.headline,
      description: r.properties?.description,
      event,
      parameters: params,
    }),
  };
}

export function useAlerts(): AlertsData {
  const [data, setData] = useState<AlertsData>({
    mostDangerous: [],
    topHazards: [],
    newWarnings: [],
    recentAlerts: [],
    loading: true,
    error: null,
    lastUpdated: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: rows, error } = await supabase
          .from("active_alerts")
          .select("alert_id, event, severity, certainty, urgency, headline, area_desc, first_seen_at, properties");
        if (error) throw error;

        const cutoff = Date.now() - NEW_WINDOW_MS;
        const alerts: Alert[] = [];
        const newCounts = new Map<string, number>();
        const recent: { ts: number; alert: Alert }[] = [];

        for (const r of (rows ?? []) as Row[]) {
          const a = rowToAlert(r);
          alerts.push(a);
          const ts = r.first_seen_at ? new Date(r.first_seen_at).getTime() : 0;
          if (ts >= cutoff && (a.kind === "Warning" || a.kind === "Emergency" || a.kind === "Watch")) {
            newCounts.set(a.event, (newCounts.get(a.event) ?? 0) + 1);
            recent.push({ ts, alert: a });
          }
        }

        const mostDangerous = [...alerts].sort((a, b) => dangerScore(a) - dangerScore(b)).slice(0, 10);

        const counts = new Map<string, number>();
        for (const a of alerts) counts.set(a.event, (counts.get(a.event) ?? 0) + 1);
        const topHazards: TopHazard[] = Array.from(counts.entries())
          .map(([event, count]) => ({ event, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        const newWarnings: NewWarning[] = Array.from(newCounts.entries())
          .map(([event, count]) => ({ event, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        const recentAlerts: Alert[] = recent
          .sort((a, b) => b.ts - a.ts)
          .map((e) => e.alert)
          .slice(0, 10);

        if (!cancelled) {
          setData({
            mostDangerous, topHazards, newWarnings, recentAlerts,
            loading: false, error: null, lastUpdated: new Date(),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setData((prev) => ({
            ...prev, loading: false,
            error: err instanceof Error ? err.message : "Failed to load alerts",
          }));
        }
      }
    }

    void load();
    const channel = supabase
      .channel("active_alerts_alerts_hook")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "active_alerts" },
        () => { void load(); })
      .subscribe();

    // Re-evaluate window-based aging once a minute even if no DB changes arrive.
    const interval = setInterval(() => { void load(); }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, []);

  return data;
}
