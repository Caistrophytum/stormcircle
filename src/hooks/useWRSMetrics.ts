/**
 * useWRSMetrics - desktop-side wiring for the WRS model.
 *
 * All scoring math lives in `src/lib/wrs.ts` (shared with mobile); this hook
 * only feeds it the selected city's sounding + unit system and adapts the
 * result to the field names the desktop components expect.
 */
import { useMemo } from "react";
import { useSoundingData } from "@/hooks/useSoundingData";
import { useRadarContext } from "@/contexts/RadarContext";
import { useUnitSystem } from "@/hooks/useUnitSystem";
import { computeWRS, type WeatherCondition } from "@/lib/wrs";

export type { WeatherCondition };

export interface MetricNode {
  label: string;
  value: string;
  unit: string;
  colorHsl: string;
  wrsContribution: number;
  primary: boolean;
}

export interface WRSMetrics {
  soundingNodes: MetricNode[];
  physicalNodes: MetricNode[];
  threatLevel: number;
  weatherCondition: WeatherCondition;
  stationActive: boolean;
  physGatePercent: number;
}

export function useWRSMetrics(): WRSMetrics {
  const radar = useRadarContext();
  const sounding = useSoundingData(
    radar.selectedCity ? { lat: radar.selectedCity.lat, lon: radar.selectedCity.lon } : null,
  );
  const unitSystem = useUnitSystem();

  return useMemo(() => {
    const r = computeWRS({
      sounding,
      hasStation: radar.selectedStation !== null,
      unitSystem,
      palette: "hsl",
    });
    const adapt = (n: (typeof r.nodes)[number]): MetricNode => ({
      label: n.label,
      value: n.value,
      unit: n.unit,
      colorHsl: n.color,
      wrsContribution: n.w,
      primary: n.primary,
    });
    return {
      soundingNodes: r.nodes.map(adapt),
      physicalNodes: r.physicalNodes.map(adapt),
      threatLevel: r.threatLevel,
      weatherCondition: r.weatherCondition,
      stationActive: r.stationActive,
      physGatePercent: r.physGatePercent,
    };
  }, [sounding, radar.selectedStation, unitSystem]);
}
