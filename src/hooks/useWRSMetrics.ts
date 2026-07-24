/**
 * useWRSMetrics — extracted from TacticalMap.
 *
 * Given the currently selected radar station (via useRadar) and its sounding
 * data, returns:
 *   • soundingNodes    — 5 virtual (buoyancy/lift) parameters + %contributions
 *   • physicalNodes    — 3 physical (RH/lift) parameters + %contributions
 *   • threatLevel      — final WRS 0-100
 *   • weatherCondition — sunny/cloudy/rainy/stormy background token
 */
import { useMemo } from "react";
import { useSoundingData } from "@/hooks/useSoundingData";
import { useRadarContext } from "@/contexts/RadarContext";
import { useUnitSystem, displayLengthM } from "@/hooks/useUnitSystem";

export type WeatherCondition = "sunny" | "cloudy" | "rainy" | "stormy";

export interface MetricNode {
  label: string;
  value: string;
  unit: string;
  colorHsl: string;   // resolved css color for the value
  wrsContribution: number;
  primary: boolean;
}

const NEON_GREEN = "hsl(142 100% 50%)";
const NEON_YELLOW = "hsl(48 100% 55%)";
const NEON_ORANGE = "hsl(28 100% 55%)";
const NEON_RED = "hsl(0 100% 60%)";

function colorFromScore(score: number, hasValue: boolean, active: boolean) {
  if (!active || !hasValue) return NEON_GREEN;
  if (score >= 0.75) return NEON_RED;
  if (score >= 0.5) return NEON_ORANGE;
  if (score >= 0.25) return NEON_YELLOW;
  return NEON_GREEN;
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

  const metrics = useMemo(() => {
    const stationActive = radar.selectedStation !== null && !sounding.loading;

    const fmt = (v: number | null, digits = 0): string => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      return digits > 0 ? v.toFixed(digits) : Math.round(v).toLocaleString();
    };
    const fmtLI = (v: number | null, digits = 1): string => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      return v.toFixed(digits);
    };
    const fmtLenM = (v: number | null): string => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      const d = displayLengthM(v, unitSystem);
      return d ? Math.round(d.value).toLocaleString() : "ERR";
    };
    const lenUnit = unitSystem === "metric" ? "m" : "ft";
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

    const capeScore = sounding.cape != null ? clamp01(sounding.cape / 4000) : 0;
    // CIN is now a *gate* rather than an additive contribution. We keep a
    // display score (higher = weaker cap = healthier) so the visual colour
    // still reflects severity, but the WRS math uses cinGate below.
    const cinMagnitude = sounding.cin != null ? Math.abs(sounding.cin) : 0;
    const cinScore = sounding.cin != null ? clamp01(1 - cinMagnitude / 200) : 0;
    const liScore = sounding.li != null ? clamp01((6 - sounding.li) / 14) : 0;
    const blhScore = sounding.blh != null ? clamp01(sounding.blh / 3000) : 0;
    const lclScore = sounding.lcl != null ? clamp01(1 - sounding.lcl / 2000) : 0;
    // EL viable 4→14 km AGL (deep convection ceiling).
    const elScore = sounding.el != null ? clamp01((sounding.el - 4000) / 10000) : 0;

    const rhSfcScore = sounding.rhSurface != null ? clamp01((sounding.rhSurface - 30) / 70) : 0;
    const rhMidScore = sounding.rhMid != null ? clamp01((sounding.rhMid - 20) / 60) : 0;
    const liftScore = sounding.omegaMid != null ? clamp01((sounding.omegaMid - 0.1) / (3 - 0.1)) : 0;

    // CAPE gate: log ramp — buoyancy fuel with diminishing returns.
    const capeGate = Math.log(1 + 9 * capeScore) / Math.log(10);
    // CIN gate: inverted log — small CIN barely dents, damage front-loaded
    // through the −50…−150 J/kg band, saturates near −200.
    const cinGate = sounding.cin == null
      ? 1
      : clamp01(1 - Math.log(1 + 9 * clamp01(cinMagnitude / 200)) / Math.log(10));
    // Both gates must be open for the storm-mode ingredients to pay out.
    const effectiveGate = capeGate * cinGate;

    // Weights: CAPE 30, LI 15, LCL 15, EL 20 (CIN's 20% is embedded in the
    // multiplicative gate instead of an additive slot).
    const capeContrib = stationActive ? Math.round(capeScore * 30) : 0;
    const liContribRaw  = stationActive ? liScore  * 15 * effectiveGate : 0;
    const lclContribRaw = stationActive ? lclScore * 15 * effectiveGate : 0;
    const elContribRaw  = stationActive ? elScore  * 20 * effectiveGate : 0;

    const PHYS_W = { sfc: 0.45, mid: 0.3, lift: 0.25 } as const;
    const physScore = clamp01(
      PHYS_W.sfc * rhSfcScore + PHYS_W.mid * rhMidScore + PHYS_W.lift * liftScore,
    );
    const physGate = Math.log(1 + 9 * physScore) / Math.log(10);

    const liContrib = Math.round(liContribRaw * physGate);
    const lclContrib = Math.round(lclContribRaw * physGate);
    const elContrib = Math.round(elContribRaw * physGate);
    const capeContribGated = Math.round(capeContrib * physGate);
    // CIN's WRS "contribution" is shown as the % of the gate it consumes
    // (0 when fully open, higher as it clamps the score). Purely display.
    const cinGateBite = stationActive ? Math.round((1 - cinGate) * 20) : 0;

    const soundingNodes: MetricNode[] = [
      { label: "CAPE", value: fmt(sounding.cape), unit: "J/kg", colorHsl: colorFromScore(capeScore, sounding.cape !== null, stationActive), wrsContribution: capeContribGated, primary: true },
      { label: "CIN", value: fmt(sounding.cin), unit: "J/kg", colorHsl: colorFromScore(cinScore, sounding.cin !== null, stationActive), wrsContribution: cinGateBite, primary: false },
      { label: "LIFTED INDEX", value: fmtLI(sounding.li, 1), unit: "", colorHsl: colorFromScore(liScore, sounding.li !== null, stationActive), wrsContribution: liContrib, primary: false },
      { label: "LCL", value: fmtLenM(sounding.lcl), unit: lenUnit, colorHsl: colorFromScore(lclScore, sounding.lcl !== null, stationActive), wrsContribution: lclContrib, primary: false },
      { label: "EL", value: fmtLenM(sounding.el), unit: lenUnit, colorHsl: colorFromScore(elScore, sounding.el !== null, stationActive), wrsContribution: elContrib, primary: false },
    ];

    const fmtPhys = (v: number | null, digits = 1) => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      return v.toFixed(digits);
    };
    const physicalNodes: MetricNode[] = [
      { label: "SFC RH", value: fmtPhys(sounding.rhSurface, 0), unit: "%", colorHsl: colorFromScore(rhSfcScore, sounding.rhSurface != null, stationActive), wrsContribution: stationActive ? Math.round(rhSfcScore * PHYS_W.sfc * 100) : 0, primary: true },
      { label: "MID RH", value: fmtPhys(sounding.rhMid, 0), unit: "%", colorHsl: colorFromScore(rhMidScore, sounding.rhMid != null, stationActive), wrsContribution: stationActive ? Math.round(rhMidScore * PHYS_W.mid * 100) : 0, primary: true },
      { label: "MID LIFT", value: fmtPhys(sounding.omegaMid, 2), unit: "m/s", colorHsl: colorFromScore(liftScore, sounding.omegaMid != null, stationActive), wrsContribution: stationActive ? Math.round(liftScore * PHYS_W.lift * 100) : 0, primary: true },
    ];

    const threat = Math.min(100, capeContribGated + liContrib + lclContrib + elContrib);
    const weatherCondition: WeatherCondition =
      threat > 85 ? "stormy" : threat >= 61 ? "rainy" : threat >= 31 ? "cloudy" : "sunny";

    return { soundingNodes, physicalNodes, threatLevel: threat, weatherCondition, stationActive, physGatePercent: Math.round(physGate * 100) };
  }, [sounding, radar.selectedStation, unitSystem]);

  return metrics;
}
