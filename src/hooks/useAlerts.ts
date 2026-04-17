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

export interface AlertsData {
  mostDangerous: Alert[];
  topHazards: TopHazard[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

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

  return (
    SEVERITY_ORDER[a.severity] * 100_000 +
    tagTier * 10_000 +
    KIND_ORDER[a.kind] * 100 +
    CERTAINTY_ORDER[a.certainty] * 10 +
    URGENCY_ORDER[a.urgency]
  );
}

export function useAlerts(): AlertsData {
  const [data, setData] = useState<AlertsData>({
    mostDangerous: [],
    topHazards: [],
    loading: true,
    error: null,
    lastUpdated: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchAlerts() {
      try {
        const res = await fetch("https://api.weather.gov/alerts/active", {
          headers: { "User-Agent": "MyWeatherApp/1.0" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const features: any[] = Array.isArray(json?.features) ? json.features : [];

        const alerts: Alert[] = features.map((f) => {
          const p = f?.properties ?? {};
          const event = String(p.event ?? "Unknown");
          return {
            event,
            severity: normalizeSeverity(p.severity),
            headline: String(p.headline ?? ""),
            areaDesc: String(p.areaDesc ?? ""),
            kind: deriveKind(event),
            certainty: normalizeCertainty(p.certainty),
            urgency: normalizeUrgency(p.urgency),
            tags: extractTags(p),
          };
        });

        const mostDangerous = [...alerts]
          .sort((a, b) => dangerScore(a) - dangerScore(b))
          .slice(0, 3);

        const counts = new Map<string, number>();
        for (const a of alerts) {
          counts.set(a.event, (counts.get(a.event) ?? 0) + 1);
        }
        const topHazards: TopHazard[] = Array.from(counts.entries())
          .map(([event, count]) => ({ event, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        if (!cancelled) {
          setData({
            mostDangerous,
            topHazards,
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
