import { useState } from "react";

interface HazardData {
  hazard: string;
  alerts: number;
}

interface DangerousAlert {
  alert: string;
  severity: "EMERGENCY" | "WARNING" | "WATCH";
}

export interface WeatherData {
  topHazards: HazardData[];
  dangerousAlerts: DangerousAlert[];
  dataNodes: { label: string; value: string; numericValue: number; unit: string; color: string; wrsContribution: number }[];
  threatLevel: number; // 0-100
}

function buildWeatherData(): WeatherData {
  // Placeholder values until real data source is wired in
  const topHazards: HazardData[] = [];
  const dangerousAlerts: DangerousAlert[] = [];

  const cape = 0;
  const cin = 0;
  const shear = 0;
  const srh = 0;
  const lcl = 0;

  const getColor = (label: string, val: number) => {
    switch (label) {
      case "CAPE": return val > 3000 ? "text-neon-red" : val > 1500 ? "text-neon-amber" : "text-neon-green";
      case "CIN": return Math.abs(val) > 80 ? "text-neon-blue" : Math.abs(val) > 40 ? "text-neon-amber" : "text-neon-green";
      case "SHEAR": return val > 50 ? "text-neon-red" : val > 30 ? "text-neon-amber" : "text-neon-green";
      case "SRH": return val > 300 ? "text-neon-red" : val > 150 ? "text-neon-amber" : "text-neon-green";
      case "LCL": return val < 500 ? "text-neon-red" : val < 1000 ? "text-neon-amber" : "text-neon-green";
      default: return "text-neon-green";
    }
  };

  // Threat level: meteorological composite score
  const lclScore = Math.max(0, Math.min(1, 1 - (lcl / 2000)));
  const cinScore = Math.max(0, Math.min(1, 1 - (Math.abs(cin) / 200)));

  // Individual WRS contributions
  const capeContrib = Math.round(Math.min(1, cape / 5000) * 35);
  const srhContrib = Math.round(Math.min(1, srh / 600) * 25);
  const shearContrib = Math.round(Math.min(1, shear / 50) * 20);
  const lclContrib = Math.round(lclScore * 12);
  const cinContrib = Math.round(cinScore * 8);

  const dataNodes = [
    { label: "CAPE", value: cape.toLocaleString(), numericValue: cape, unit: "J/kg", color: getColor("CAPE", cape), wrsContribution: capeContrib },
    { label: "CIN", value: String(cin), numericValue: cin, unit: "J/kg", color: getColor("CIN", cin), wrsContribution: cinContrib },
    { label: "0-6km SHEAR", value: String(shear), numericValue: shear, unit: "kts", color: getColor("SHEAR", shear), wrsContribution: shearContrib },
    { label: "0-1km SRH", value: String(srh), numericValue: srh, unit: "m²/s²", color: getColor("SRH", srh), wrsContribution: srhContrib },
    { label: "LCL", value: String(lcl), numericValue: lcl, unit: "m", color: getColor("LCL", lcl), wrsContribution: lclContrib },
  ];

  const threatLevel = Math.min(100, Math.round(
    capeContrib + srhContrib + shearContrib + lclContrib + cinContrib
  ));

  return { topHazards, dangerousAlerts, dataNodes, threatLevel };
}

// Signature kept for backwards compatibility with existing callers (intervalMs is ignored)
export function useWeatherData(_intervalMs?: number) {
  const [data, setData] = useState<WeatherData>(() => buildWeatherData());
  const refresh = () => setData(buildWeatherData());
  return { data, refresh };
}
