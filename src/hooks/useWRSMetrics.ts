/**
 * useWRSMetrics - desktop-side wiring for the WRS model.
 *
 * All scoring math lives in `src/lib/wrs.ts` (shared with mobile); this hook
 * only feeds it the selected city's sounding + unit system and adapts the
 * result to the field names the desktop components expect.
 */
import { useMemo } from "react";
import { useSoundingForecast } from "@/hooks/useSoundingForecast";
import { useSoundingData } from "@/hooks/useSoundingData";
import { useHometownCoords } from "@/hooks/useHometownCoords";
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
  /** ISO UTC time of the forecast hour when hourOffset > 0. */
  forecastTime: string | null;
  forecastLoading: boolean;
}

/** @param hourOffset 0 = live; 1..24 = simulated from the hourly forecast. */
export function useWRSMetrics(hourOffset = 0): WRSMetrics {
  const radar = useRadarContext();
  const hometown = useHometownCoords();
  const loc = radar.selectedCity ?? hometown;
  const live = useSoundingData(loc);
  const forecast = useSoundingForecast(loc, hourOffset > 0);
  const fh = hourOffset > 0 ? forecast.hours[hourOffset] : undefined;
  const sounding = hourOffset > 0 ? (fh?.sounding ?? { ...live, loading: true }) : live;
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
      forecastTime: fh?.time ?? null,
      forecastLoading: hourOffset > 0 && forecast.loading,
    };
  }, [sounding, radar.selectedStation, unitSystem, fh, hourOffset, forecast.loading]);
}
