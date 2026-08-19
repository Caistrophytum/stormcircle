/**
 * wrs.ts — single source of truth for the Weather Risk Score (WRS) math.
 *
 * Both the desktop hook (`useWRSMetrics`) and the mobile dashboard
 * (`MobileMain`) call `computeWRS()` so the weights, gates and colour
 * thresholds can never drift apart.
 *
 * Model (see comments inline):
 *   • Virtual block  — CAPE (37.5), SHEAR (31.25), EL (18.75), LCL (12.5).
 *     CIN is NOT additive: it is a multiplicative gate that subtracts points.
 *   • Physical block — SFC RH 50%, MID RH 35%, MID LAPSE 15% → `physGate`,
 *     a log-shaped multiplier applied to the whole virtual block.
 */
import { displayLengthM, type UnitSystem } from "@/hooks/useUnitSystem";

export type WeatherCondition = "sunny" | "cloudy" | "rainy" | "stormy";

/** Minimal shape of `useSoundingData()` consumed by the WRS model. */
export interface WRSSounding {
  cape: number | null;
  cin: number | null;
  shear: number | null;
  lcl: number | null;
  el: number | null;
  rhSurface: number | null;
  rhMid: number | null;
  lapseMid: number | null;
  loading: boolean;
}

export interface WRSNode {
  label: string;
  value: string;
  unit: string;
  /** Resolved CSS colour (palette-dependent). */
  color: string;
  /** WRS points contributed (virtual) or weighted % (physical). */
  w: number;
  primary: boolean;
}

export interface WRSResult {
  nodes: WRSNode[];
  physicalNodes: WRSNode[];
  threatLevel: number;
  physGatePercent: number;
  stationActive: boolean;
  weatherCondition: WeatherCondition;
}

const PALETTES = {
  hsl: {
    green: "hsl(142 100% 50%)",
    yellow: "hsl(48 100% 55%)",
    orange: "hsl(28 100% 55%)",
    red: "hsl(0 100% 60%)",
  },
  hex: { green: "#7CFC00", yellow: "#ffd700", orange: "#ff8c00", red: "#ff3b3b" },
} as const;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Additive virtual weights, renormalized to 100 after CIN's 20% moved into the gate. */
const W = { cape: 37.5, shear: 31.25, el: 18.75, lcl: 12.5 } as const;
/** Physical (enabling-environment) blend weights. */
const PHYS_W = { sfc: 0.5, mid: 0.35, lapse: 0.15 } as const;

export function computeWRS(opts: {
  sounding: WRSSounding;
  /** A radar station / city is selected (false → placeholder dashes). */
  hasStation: boolean;
  unitSystem: UnitSystem;
  palette?: keyof typeof PALETTES;
}): WRSResult {
  const { sounding, hasStation, unitSystem } = opts;
  const P = PALETTES[opts.palette ?? "hsl"];
  const stationActive = hasStation && !sounding.loading;

  // ── Formatters ────────────────────────────────────────────────────
  const guard = (v: number | null): string | null => {
    if (sounding.loading) return "...";
    if (!hasStation) return "—";
    if (v == null) return "ERR";
    return null;
  };
  const fmt = (v: number | null, digits = 0) =>
    guard(v) ?? (digits > 0 ? v!.toFixed(digits) : Math.round(v!).toLocaleString());
  const fmtNum = (v: number | null, digits = 1) => guard(v) ?? v!.toFixed(digits);
  const fmtLenM = (v: number | null) => {
    const g = guard(v);
    if (g) return g;
    const d = displayLengthM(v, unitSystem);
    return d ? Math.round(d.value).toLocaleString() : "ERR";
  };
  const lenUnit = unitSystem === "metric" ? "m" : "ft";

  const color = (score: number, hasValue: boolean) => {
    if (!stationActive || !hasValue) return P.green;
    if (score >= 0.75) return P.red;
    if (score >= 0.5) return P.orange;
    if (score >= 0.25) return P.yellow;
    return P.green;
  };

  // ── Normalized scores ─────────────────────────────────────────────
  const capeScore = sounding.cape != null ? clamp01(sounding.cape / 4000) : 0;
  const cinMagnitude = sounding.cin != null ? Math.abs(sounding.cin) : 0;
  const cinScore = sounding.cin != null ? clamp01(1 - cinMagnitude / 200) : 0;
  // Bulk shear (850↔500 hPa, m/s) — 20 m/s ≈ supercell-organization ceiling.
  const shearScore = sounding.shear != null ? clamp01(sounding.shear / 20) : 0;
  const lclScore = sounding.lcl != null ? clamp01(1 - sounding.lcl / 2000) : 0;
  // EL viable 4→14 km AGL (deep convection ceiling).
  const elScore = sounding.el != null ? clamp01((sounding.el - 4000) / 10000) : 0;

  const rhSfcScore = sounding.rhSurface != null ? clamp01((sounding.rhSurface - 30) / 70) : 0;
  const rhMidScore = sounding.rhMid != null ? clamp01((sounding.rhMid - 20) / 60) : 0;
  // Mid-level lapse rate (700→500 hPa): 5.5 °C/km moist-neutral → 8.5 steep.
  const lapseScore =
    sounding.lapseMid != null ? clamp01((sounding.lapseMid - 5.5) / (8.5 - 5.5)) : 0;

  // ── Gates ─────────────────────────────────────────────────────────
  const capeGate = Math.log(1 + 9 * capeScore) / Math.log(10);
  const cinGate =
    sounding.cin == null
      ? 1
      : clamp01(1 - Math.log(1 + 9 * clamp01(cinMagnitude / 200)) / Math.log(10));
  const effectiveGate = capeGate * cinGate;

  const physScore = clamp01(
    PHYS_W.sfc * rhSfcScore + PHYS_W.mid * rhMidScore + PHYS_W.lapse * lapseScore,
  );
  const physGate = Math.log(1 + 9 * physScore) / Math.log(10);

  // ── Contributions ─────────────────────────────────────────────────
  const capeContrib = stationActive ? Math.round(capeScore * W.cape * physGate) : 0;
  const shearContrib = stationActive
    ? Math.round(shearScore * W.shear * effectiveGate * physGate)
    : 0;
  const lclContrib = stationActive ? Math.round(lclScore * W.lcl * effectiveGate * physGate) : 0;
  const elContrib = stationActive ? Math.round(elScore * W.el * effectiveGate * physGate) : 0;
  // CIN subtracts: it closes the effective gate on the shear/LCL/EL bundle.
  const virtualBundle = shearScore * W.shear + lclScore * W.lcl + elScore * W.el;
  const cinLoss = stationActive
    ? Math.round(capeGate * physGate * virtualBundle * (1 - cinGate))
    : 0;

  const nodes: WRSNode[] = [
    { label: "CAPE", value: fmt(sounding.cape), unit: "J/kg", color: color(capeScore, sounding.cape != null), w: capeContrib, primary: true },
    { label: "CIN", value: fmt(sounding.cin), unit: "J/kg", color: color(cinScore, sounding.cin != null), w: -cinLoss, primary: true },
    { label: "SHEAR", value: fmtNum(sounding.shear, 1), unit: "m/s", color: color(shearScore, sounding.shear != null), w: shearContrib, primary: true },
    { label: "LCL", value: fmtLenM(sounding.lcl), unit: lenUnit, color: color(lclScore, sounding.lcl != null), w: lclContrib, primary: false },
    { label: "EL", value: fmtLenM(sounding.el), unit: lenUnit, color: color(elScore, sounding.el != null), w: elContrib, primary: false },
  ];

  const physicalNodes: WRSNode[] = [
    { label: "SFC RH", value: fmtNum(sounding.rhSurface, 0), unit: "%", color: color(rhSfcScore, sounding.rhSurface != null), w: stationActive ? Math.round(rhSfcScore * PHYS_W.sfc * 100) : 0, primary: true },
    { label: "MID RH", value: fmtNum(sounding.rhMid, 0), unit: "%", color: color(rhMidScore, sounding.rhMid != null), w: stationActive ? Math.round(rhMidScore * PHYS_W.mid * 100) : 0, primary: true },
    { label: "MID LAPSE", value: fmtNum(sounding.lapseMid, 1), unit: "°C/km", color: color(lapseScore, sounding.lapseMid != null), w: stationActive ? Math.round(lapseScore * PHYS_W.lapse * 100) : 0, primary: true },
  ];

  const threatLevel = Math.min(
    100,
    Math.max(0, capeContrib + shearContrib + lclContrib + elContrib - cinLoss),
  );
  const weatherCondition: WeatherCondition =
    threatLevel > 85 ? "stormy" : threatLevel >= 61 ? "rainy" : threatLevel >= 31 ? "cloudy" : "sunny";

  return { nodes, physicalNodes, threatLevel, physGatePercent: Math.round(physGate * 100), stationActive, weatherCondition };
}
