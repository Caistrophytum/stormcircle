import { useEffect, useRef, useState } from "react";

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

export const LSR_COLORS: Record<string, string> = {
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

export const LSR_DEFAULT_COLOR = "#AAAAAA";

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
  const key = Object.keys(SOURCE_BADGES).find((k) =>
    lower.includes(k.toLowerCase())
  );
  return key ? SOURCE_BADGES[key] : "#AAAAAA";
}

const LSR_URL =
  "https://mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py?wfo=ALL&recent=7200&fmt=geojson";
const REFRESH_MS = 60_000;

interface UseLSRResult {
  reports: LSRReport[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useLSR(): UseLSRResult {
  const [reports, setReports] = useState<LSRReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const fetchReports = async () => {
      try {
        const res = await fetch(LSR_URL);
        if (!res.ok) throw new Error(`LSR fetch failed: ${res.status}`);
        const data = await res.json();
        const features: any[] = Array.isArray(data?.features) ? data.features : [];

        const parsed: LSRReport[] = features
          .map((f) => {
            const p = f?.properties ?? {};
            const coords = f?.geometry?.coordinates;
            const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
            const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

            const magRaw = p.magnitude;
            const magnitude =
              magRaw === null || magRaw === undefined || magRaw === ""
                ? null
                : Number.isFinite(Number(magRaw))
                ? Number(magRaw)
                : null;

            const report: LSRReport = {
              valid: String(p.valid ?? ""),
              typetext: String(p.typetext ?? ""),
              city: String(p.city ?? ""),
              county: String(p.county ?? ""),
              state: String(p.state ?? ""),
              source: String(p.source ?? ""),
              remark: String(p.remark ?? ""),
              magnitude,
              wfo: String(p.wfo ?? ""),
              lat,
              lon,
            };
            return report;
          })
          .filter((r): r is LSRReport => r !== null)
          .sort((a, b) => (a.valid < b.valid ? 1 : -1));

        if (cancelledRef.current) return;
        setReports(parsed);
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to fetch LSRs");
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    };

    fetchReports();
    const id = setInterval(fetchReports, REFRESH_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, []);

  return { reports, loading, error, lastUpdated };
}
