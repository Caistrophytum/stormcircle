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
    const fmtNum = (v: number | null, digits = 1): string => {
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
    // CIN is a *gate* rather than an additive contribution. We keep a
    // display score (higher = weaker cap = healthier) so the visual colour
    // still reflects severity, but the WRS math uses cinGate below.
    const cinMagnitude = sounding.cin != null ? Math.abs(sounding.cin) : 0;
    const cinScore = sounding.cin != null ? clamp01(1 - cinMagnitude / 200) : 0;
    // Bulk shear (850↔500 hPa, m/s) — storm-organization proxy. 20 m/s ≈
    // classic supercell / high-end organization ceiling.
    const shearScore = sounding.shear != null ? clamp01(sounding.shear / 20) : 0;
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
    // Both gates must be open for the storm-mode/structure ingredients
    // (shear, LCL, EL) to pay out.
    const effectiveGate = capeGate * cinGate;

    // CIN is not additive — its 20% lives in the multiplicative gate, so the
    // remaining additive weights (CAPE 30, SHEAR 25, EL 15, LCL 10 = 80) are
    // renormalized to a full 100-point scale (÷0.8).
    const W = { cape: 37.5, shear: 31.25, el: 18.75, lcl: 12.5 } as const;
    const capeContrib = stationActive ? capeScore * W.cape : 0;
    const shearContribRaw = stationActive ? shearScore * W.shear * effectiveGate : 0;
    const lclContribRaw   = stationActive ? lclScore   * W.lcl   * effectiveGate : 0;
    const elContribRaw    = stationActive ? elScore    * W.el    * effectiveGate : 0;

    const PHYS_W = { sfc: 0.45, mid: 0.3, lift: 0.25 } as const;
    const physScore = clamp01(
      PHYS_W.sfc * rhSfcScore + PHYS_W.mid * rhMidScore + PHYS_W.lift * liftScore,
    );
    const physGate = Math.log(1 + 9 * physScore) / Math.log(10);

    const shearContrib = Math.round(shearContribRaw * physGate);
    const lclContrib = Math.round(lclContribRaw * physGate);
    const elContrib = Math.round(elContribRaw * physGate);
    const capeContribGated = Math.round(capeContrib * physGate);
    // CIN does not add to WRS — it subtracts by closing the effective gate on
    // the shear/LCL/EL bundle. Show the actual WRS point loss as a negative.
    const virtualBundle = shearScore * W.shear + lclScore * W.lcl + elScore * W.el;
    const cinLoss = stationActive
      ? Math.round(capeGate * physGate * virtualBundle * (1 - cinGate))
      : 0;

    const soundingNodes: MetricNode[] = [
      { label: "CAPE", value: fmt(sounding.cape), unit: "J/kg", colorHsl: colorFromScore(capeScore, sounding.cape !== null, stationActive), wrsContribution: capeContribGated, primary: true },
      { label: "CIN", value: fmt(sounding.cin), unit: "J/kg", colorHsl: colorFromScore(cinScore, sounding.cin !== null, stationActive), wrsContribution: -cinLoss, primary: true },
      { label: "SHEAR", value: fmtNum(sounding.shear, 1), unit: "m/s", colorHsl: colorFromScore(shearScore, sounding.shear !== null, stationActive), wrsContribution: shearContrib, primary: true },
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
      { label: "VERT VEL", value: fmtPhys(sounding.omegaMid, 2), unit: "m/s", colorHsl: colorFromScore(liftScore, sounding.omegaMid != null, stationActive), wrsContribution: stationActive ? Math.round(liftScore * PHYS_W.lift * 100) : 0, primary: true },
    ];

    const threat = Math.min(100, Math.max(0, capeContribGated + shearContrib + lclContrib + elContrib - cinLoss));
    const weatherCondition: WeatherCondition =
      threat > 85 ? "stormy" : threat >= 61 ? "rainy" : threat >= 31 ? "cloudy" : "sunny";

    return { soundingNodes, physicalNodes, threatLevel: threat, weatherCondition, stationActive, physGatePercent: Math.round(physGate * 100) };
  }, [sounding, radar.selectedStation, unitSystem]);

  return metrics;
}
