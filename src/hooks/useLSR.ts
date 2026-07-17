/**
 * useLSR — thin selector over the shared DataProvider, plus pure styling
 * helpers used to color local storm reports on maps and in lists.
 */
import { useDataContext } from "@/providers/DataProvider";

export interface LSRReport {
  valid: string;
  typetext: string;
  city: string;
  county: string;
  state: string;
  source: string;
  remark: string;
  magnitude: number | null;
  wfo: string;
  lat: number;
  lon: number;
}

const LSR_COLORS: Record<string, string> = {
  TORNADO: "#FF0000",
  "FUNNEL CLOUD": "#FF69B4",
  "WALL CLOUD": "#DA70D6",
  "LARGE HAIL": "#00FF00",
  "DAMAGING WIND": "#FFA500",
  "HIGH WIND": "#FFD700",
  FLOOD: "#00BFFF",
  "FLASH FLOOD": "#1E90FF",
  "HEAVY RAIN": "#4169E1",
  SNOW: "#FFFFFF",
  BLIZZARD: "#B0C4DE",
  "FREEZING RAIN": "#87CEEB",
  LIGHTNING: "#FFFF00",
  FIRE: "#FF4500",
  FOG: "#708090",
  "DUST STORM": "#D2B48C",
};

const LSR_DEFAULT_COLOR = "#AAAAAA";

export function getLSRColor(typetext: string): string {
  const upper = typetext.toUpperCase();
  const key = Object.keys(LSR_COLORS).find((k) => upper.includes(k));
  return key ? LSR_COLORS[key] : LSR_DEFAULT_COLOR;
}

export const SOURCE_BADGES: Record<string, string> = {
  "Trained Spotter": "#00FF00",
  SKYWARN: "#00FF00",
  "Law Enforcement": "#4169E1",
  "Emergency Manager": "#FF8C00",
  Public: "#AAAAAA",
  "Official NWS Observations": "#00BFFF",
  "Fire Department": "#FF4500",
  "NWS Employee": "#00BFFF",
  CoCoRaHS: "#9370DB",
};

export function getSourceColor(source: string): string {
  const lower = source.toLowerCase();
  const key = Object.keys(SOURCE_BADGES).find((k) => lower.includes(k.toLowerCase()));
  return key ? SOURCE_BADGES[key] : "#AAAAAA";
}

interface UseLSRResult {
  reports: LSRReport[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useLSR(): UseLSRResult {
  return useDataContext().lsr;
}
