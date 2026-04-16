import { useState, useEffect, useCallback } from "react";

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

const hazardTypes = ["THUNDERSTORM", "FLOOD", "WIND", "TORNADO", "HAIL", "ICE STORM", "BLIZZARD", "HEAT WAVE"];
const locations = ["Oklahoma", "Houston", "Illinois", "Kansas", "Nebraska", "Iowa", "Missouri", "Arkansas", "Texas", "Colorado"];
const alertTypes = [
  "EF4 TORNADO", "EF3 TORNADO", "EF2 TORNADO", "FLASH FLOOD", "DERECHO",
  "SEVERE HAIL", "BLIZZARD", "ICE STORM", "HEAT DOME", "DUST STORM",
];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateWeatherData(): WeatherData {
  // Generate hazards
  const selectedHazards = pickRandom(hazardTypes, 5);
  const topHazards = selectedHazards
    .map((h) => ({ hazard: h, alerts: rand(10, 350) }))
    .sort((a, b) => b.alerts - a.alerts);

  // Generate dangerous alerts
  const severities: ("EMERGENCY" | "WARNING" | "WATCH")[] = ["EMERGENCY", "WARNING", "WATCH"];
  const selectedAlerts = pickRandom(alertTypes, 3);
  const selectedLocations = pickRandom(locations, 3);
  const dangerousAlerts = selectedAlerts.map((a, i) => ({
    alert: `${a} — ${selectedLocations[i]}`,
    severity: severities[Math.min(i, 2)],
  }));

  // Generate data nodes
  const cape = rand(0, 6000);
  const cin = -rand(0, 250);
  const shear = rand(0, 80);
  const srh = rand(0, 700);
  const lcl = rand(200, 2500);

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

  const dataNodes = [
    { label: "CAPE", value: cape.toLocaleString(), numericValue: cape, unit: "J/kg", color: getColor("CAPE", cape) },
    { label: "CIN", value: String(cin), numericValue: cin, unit: "J/kg", color: getColor("CIN", cin) },
    { label: "0-6km SHEAR", value: String(shear), numericValue: shear, unit: "kts", color: getColor("SHEAR", shear) },
    { label: "0-1km SRH", value: String(srh), numericValue: srh, unit: "m²/s²", color: getColor("SRH", srh) },
    { label: "LCL", value: String(lcl), numericValue: lcl, unit: "m", color: getColor("LCL", lcl) },
  ];

  // Threat level: meteorological composite score
  const lclScore = Math.max(0, Math.min(1, 1 - (lcl / 2000)));
  const cinScore = Math.max(0, Math.min(1, 1 - (Math.abs(cin) / 200)));
  const threatLevel = Math.min(100, Math.round(
    (cape / 5000) * 35 +
    (srh / 600) * 25 +
    (shear / 50) * 20 +
    lclScore * 12 +
    cinScore * 8
  ) * 100 / 100);

  return { topHazards, dangerousAlerts, dataNodes, threatLevel };
}

export function useWeatherData(intervalMs = 15000) {
  const [data, setData] = useState<WeatherData>(() => generateWeatherData());

  const refresh = useCallback(() => {
    setData(generateWeatherData());
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { data, refresh };
}
