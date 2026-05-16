import { useEffect, useState } from "react";

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
  /** Special damage-tag flags such as PDS, Tornado Emergency, "considerable"/"destructive" tags */
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
  /** Warnings that appeared (by alert id) within the last 5 refresh cycles. */
  newWarnings: NewWarning[];
  /** Individual alerts whose ids first appeared in the rolling window, newest first. */
  recentAlerts: Alert[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const REFRESH_HISTORY_WINDOW = 5;

const REFRESH_INTERVAL_MS = 60_000; // 1 minute

const SEVERITY_ORDER: Record<Severity, number> = {
  Extreme: 0,
  Severe: 1,
  Moderate: 2,
  Minor: 3,
  Unknown: 4,
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
  ]
    .filter(Boolean)
    .map((v: any) => String(v).toLowerCase())
    .join(" ");

  if (/particularly dangerous situation|\bpds\b/.test(haystack)) tags.push("PDS");
  if (/tornado emergency/.test(haystack)) tags.push("Tornado Emergency");
  if (/flash flood emergency/.test(haystack)) tags.push("Flash Flood Emergency");
  if (/\bdestructive\b/.test(haystack)) tags.push("Destructive");
  if (/\bconsiderable\b/.test(haystack)) tags.push("Considerable");
  if (/\bcatastrophic\b/.test(haystack)) tags.push("Catastrophic");

  return Array.from(new Set(tags));
}

const KIND_ORDER: Record<AlertKind, number> = {
  Emergency: 0,
  Warning: 1,
  Watch: 2,
  Advisory: 3,
  Statement: 4,
  Other: 5,
};

const CERTAINTY_ORDER: Record<Certainty, number> = {
  Observed: 0,
  Likely: 1,
  Possible: 2,
  Unlikely: 3,
  Unknown: 4,
};

const URGENCY_ORDER: Record<Urgency, number> = {
  Immediate: 0,
  Expected: 1,
  Future: 2,
  Past: 3,
  Unknown: 4,
};

/**
 * Lower score = more dangerous. Severity dominates (Extreme always above Severe,
 * etc.), with damage tags as a tiebreaker within the same severity, then kind,
 * certainty, and urgency.
 */
function dangerScore(a: Alert): number {
  let tagTier = 4; // none
  if (a.tags.includes("Tornado Emergency") || a.tags.includes("Flash Flood Emergency")) tagTier = 0;
  else if (a.tags.includes("PDS") || a.tags.includes("Catastrophic")) tagTier = 1;
  else if (a.tags.includes("Destructive")) tagTier = 2;
  else if (a.tags.includes("Considerable")) tagTier = 3;

  // Kind dominates so a Warning is always ranked above a Watch (regardless of
  // severity). Within the same kind, Extreme severity ranks highest, then
  // tagged warnings (Considerable/Destructive/PDS/etc.) outrank untagged
  // warnings of any non-Extreme severity. Certainty and urgency tie-break.
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
    // Monotonic cycle counter — incremented once per successful fetch.
    let cycle = 0;
    // Set of alert ids we've ever seen (used to detect first appearance).
    const everSeen = new Set<string>();
    // First-seen cycle index per alert id (so we can age entries out of the window).
    // Also remember the event label so it survives even if the alert drops from the feed.
    const firstSeen = new Map<string, { cycle: number; event: string }>();
    // Per-id snapshot of the actual alert payload, so recentAlerts survives
    // even if the alert briefly drops from the active feed.
    const recentById = new Map<string, { cycle: number; alert: Alert }>();

    async function fetchAlerts() {
      try {
        const res = await fetch("https://api.weather.gov/alerts/active", {
          headers: { "User-Agent": "MyWeatherApp/1.0" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const features: any[] = Array.isArray(json?.features) ? json.features : [];

        const alerts: Alert[] = [];
        const currentIds = new Set<string>();
        const idToEvent = new Map<string, string>();
        const idToAlert = new Map<string, Alert>();

        for (const f of features) {
          const p = f?.properties ?? {};
          const event = String(p.event ?? "Unknown");
          const id = String(f?.id ?? p.id ?? `${event}|${p.sent ?? ""}|${p.areaDesc ?? ""}`);
          currentIds.add(id);
          idToEvent.set(id, event);
          const a: Alert = {
            event,
            severity: normalizeSeverity(p.severity),
            headline: String(p.headline ?? ""),
            areaDesc: String(p.areaDesc ?? ""),
            kind: deriveKind(event),
            certainty: normalizeCertainty(p.certainty),
            urgency: normalizeUrgency(p.urgency),
            tags: extractTags(p),
          };
          alerts.push(a);
          idToAlert.set(id, a);
        }

        const mostDangerous = [...alerts]
          .sort((a, b) => dangerScore(a) - dangerScore(b))
          .slice(0, 10);

        const counts = new Map<string, number>();
        for (const a of alerts) {
          counts.set(a.event, (counts.get(a.event) ?? 0) + 1);
        }
        const topHazards: TopHazard[] = Array.from(counts.entries())
          .map(([event, count]) => ({ event, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        // Increment cycle counter. On the very first fetch (cycle becomes 1),
        // we treat everything as "pre-existing" to avoid flagging the entire
        // initial load as new.
        cycle += 1;
        const isInitial = cycle === 1;

        for (const id of currentIds) {
          if (!everSeen.has(id)) {
            everSeen.add(id);
            if (!isInitial) {
              const event = idToEvent.get(id) ?? "Unknown";
              const kind = deriveKind(event);
              if (kind === "Warning" || kind === "Emergency" || kind === "Watch") {
                firstSeen.set(id, { cycle, event });
                const a = idToAlert.get(id);
                if (a) recentById.set(id, { cycle, alert: a });
              }
            }
          }
        }

        // Aggregate all first-seen entries whose first-seen cycle is still
        // inside the rolling window (last REFRESH_HISTORY_WINDOW cycles).
        const newWarningCounts = new Map<string, number>();
        for (const [id, info] of firstSeen) {
          if (cycle - info.cycle < REFRESH_HISTORY_WINDOW) {
            newWarningCounts.set(info.event, (newWarningCounts.get(info.event) ?? 0) + 1);
          } else {
            // Aged out — remove to keep the map small.
            firstSeen.delete(id);
          }
        }

        const newWarnings: NewWarning[] = Array.from(newWarningCounts.entries())
          .map(([event, count]) => ({ event, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // Age out recentById in the same window, then sort newest-first.
        const recentEntries: { cycle: number; alert: Alert }[] = [];
        for (const [id, info] of recentById) {
          if (cycle - info.cycle < REFRESH_HISTORY_WINDOW) {
            recentEntries.push(info);
          } else {
            recentById.delete(id);
          }
        }
        const recentAlerts: Alert[] = recentEntries
          .sort((a, b) => b.cycle - a.cycle)
          .map((e) => e.alert)
          .slice(0, 10);

        if (!cancelled) {
          setData({
            mostDangerous,
            topHazards,
            newWarnings,
            recentAlerts,
            loading: false,
            error: null,
            lastUpdated: new Date(),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setData((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to fetch alerts",
          }));
        }
      }
    }

    fetchAlerts();
    const intervalId = setInterval(fetchAlerts, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return data;
}
