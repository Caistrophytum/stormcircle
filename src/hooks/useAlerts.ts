import { useEffect, useState } from "react";

export type Severity = "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";

export interface Alert {
  event: string;
  severity: Severity;
  headline: string;
  areaDesc: string;
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
}

const SEVERITY_ORDER: Record<Severity, number> = {
  Extreme: 0,
  Severe: 1,
  Moderate: 2,
  Minor: 3,
  Unknown: 4,
};

const VALID_SEVERITIES: Severity[] = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];

function normalizeSeverity(s: unknown): Severity {
  return VALID_SEVERITIES.includes(s as Severity) ? (s as Severity) : "Unknown";
}

export function useAlerts(): AlertsData {
  const [data, setData] = useState<AlertsData>({
    mostDangerous: [],
    topHazards: [],
    loading: true,
    error: null,
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
          return {
            event: String(p.event ?? "Unknown"),
            severity: normalizeSeverity(p.severity),
            headline: String(p.headline ?? ""),
            areaDesc: String(p.areaDesc ?? ""),
          };
        });

        const mostDangerous = [...alerts]
          .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
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
          setData({ mostDangerous, topHazards, loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setData({
            mostDangerous: [],
            topHazards: [],
            loading: false,
            error: err instanceof Error ? err.message : "Failed to fetch alerts",
          });
        }
      }
    }

    fetchAlerts();
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
