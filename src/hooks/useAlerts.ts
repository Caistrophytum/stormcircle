/**
 * useAlerts — thin selector over the shared DataProvider.
 *
 * Types are exported here so all existing imports (`from "@/hooks/useAlerts"`)
 * continue to work unchanged. The actual fetching, derivation, and realtime
 * subscription live in src/providers/DataProvider.tsx so the work runs ONCE
 * per page instead of once per component that calls this hook.
 */
import { useDataContext } from "@/providers/DataProvider";

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

export interface TopHazard { event: string; count: number; }
export interface NewWarning { event: string; count: number; }

export interface AlertsData {
  mostDangerous: Alert[];
  topHazards: TopHazard[];
  newWarnings: NewWarning[];
  recentAlerts: Alert[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useAlerts(): AlertsData {
  return useDataContext().alerts;
}
