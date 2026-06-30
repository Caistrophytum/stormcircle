import { forwardRef, lazy, Suspense, useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import EventInfoPanel from "./EventInfoPanel";


import { useRadar } from "@/hooks/useRadar";
import { useSoundingData } from "@/hooks/useSoundingData";
import { useAlerts } from "@/hooks/useAlerts";
import { useAuth } from "@/hooks/useAuth";
import { useHomeCityRisk, type SPCRiskLevel } from "@/hooks/useHomeCityRisk";
import { useHomeCityFireRisk, type FireRiskLevel } from "@/hooks/useHomeCityFireRisk";
import { useWarningPolygons, type WarningPolygon } from "@/hooks/useWarningPolygons";
import { useDataContext } from "@/providers/DataProvider";
import {
  useUnitSystem,
  displayTemp,
  displayLengthM,
} from "@/hooks/useUnitSystem";

// Code-split the radar mini-map: pulls leaflet + react-leaflet (~150KB gz)
// out of the initial bundle so first paint isn't blocked by it.
const RadarMiniMap = lazy(() => import("./RadarMiniMap"));

type WeatherCondition = "sunny" | "cloudy" | "rainy" | "stormy";

// Lazy-resolved URLs — only the active background is requested by the browser.
// Vite still fingerprints them via new URL(...) so caching works as usual.
const weatherBackgrounds: Record<WeatherCondition, string> = {
  sunny: new URL("../assets/weather-calm.jpg", import.meta.url).href,
  cloudy: new URL("../assets/weather-overcast.jpg", import.meta.url).href,
  rainy: new URL("../assets/weather-rainy.jpg", import.meta.url).href,
  stormy: new URL("../assets/weather-stormy.jpg", import.meta.url).href,
};

// ─── Home-city bar helpers ──────────────────────────────────────────────
// Tier ranking for "most dangerous" warning polygon. Higher wins.
function rankWarning(p: WarningPolygon): number | null {
  const ev = p.event;
  const text = `${p.description} ${p.headline} ${p.parameters?.spcWatchTitle ?? ""} ${p.parameters?.spcPds ?? ""}`.toLowerCase();
  const pds = /particularly dangerous situation|\bpds\b/.test(text);
  if (ev === "Tornado Warning") {
    if (text.includes("tornado emergency")) return 8;
    if (pds) return 7;
    return 6;
  }
  if (ev === "Flash Flood Warning") {
    if (text.includes("flash flood emergency")) return 5;
    return 2;
  }
  if (ev === "Severe Thunderstorm Warning") {
    if (pds) return 4;
    return 3;
  }
  if (ev.endsWith("Warning")) return 1;
  return null;
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestVertexKm(
  origin: { lat: number; lon: number },
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number {
  const polys: number[][][][] =
    geom.type === "Polygon"
      ? [geom.coordinates as number[][][]]
      : (geom.coordinates as number[][][][]);
  let best = Infinity;
  for (const poly of polys) {
    if (!poly.length) continue;
    for (const [lon, lat] of poly[0]) {
      const d = haversineKm(origin, { lat, lon });
      if (d < best) best = d;
    }
  }
  return best;
}

// Marquee — auto-scrolls horizontally only when text overflows.
function MarqueeText({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [duration, setDuration] = useState(20);

  useLayoutEffect(() => {
    const c = containerRef.current;
    const m = measureRef.current;
    if (!c || !m) return;
    const recalc = () => {
      const overflows = m.scrollWidth > c.clientWidth + 1;
      setOverflow(overflows);
      if (overflows) {
        // ~80px per second
        setDuration(Math.max(12, (m.scrollWidth + c.clientWidth) / 80));
      }
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(c);
    ro.observe(m);
    return () => ro.disconnect();
  }, [text]);

  if (!overflow) {
    return (
      <div ref={containerRef} className="flex-1 overflow-hidden">
        <span ref={measureRef} className={`${className ?? ""} whitespace-nowrap inline-block`}>
          {text}
        </span>
      </div>
    );
  }
  return (
    <div ref={containerRef} className="flex-1 overflow-hidden">
      <div
        className="animate-marquee flex w-max"
        style={{ animationDuration: `${duration}s` }}
      >
        <span ref={measureRef} className={`${className ?? ""} whitespace-nowrap inline-block pr-12`}>
          {text}
        </span>
        <span className={`${className ?? ""} whitespace-nowrap inline-block pr-12`} aria-hidden>
          {text}
        </span>
      </div>
    </div>
  );
}

interface Props {
  overlayScale: number;
}

const TacticalMap = forwardRef<HTMLElement, Props>(({ overlayScale }, ref) => {
  
  const [radarExpanded, setRadarExpanded] = useState(false);
  const radar = useRadar();
  const sounding = useSoundingData(
    radar.selectedCity ? { lat: radar.selectedCity.lat, lon: radar.selectedCity.lon } : null,
  );
  const unitSystem = useUnitSystem();
  const alerts = useAlerts();
  const { user, profile } = useAuth();
  const homeRisk = useHomeCityRisk(profile?.location ?? null);
  const warningPolygons = useWarningPolygons();

  // ─── Recovery indicator ───────────────────────────────────────────────
  // If the boot sequence hasn't flipped `appReady` within 10 s, show a
  // small "recovering…" hint. The DataProvider watchdog will auto-recover
  // at 15 s; this gives the user a 5-second heads-up that something is off
  // instead of leaving them staring at empty panels.
  const { appReady } = useDataContext();
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  useEffect(() => {
    if (appReady) {
      setLoadingTooLong(false);
      return;
    }
    const t = setTimeout(() => setLoadingTooLong(true), 10_000);
    return () => clearTimeout(t);
  }, [appReady]);

  // On first load: auto-pan radar to the station nearest the user's home city,
  // unless they've already picked a different city this session.
  const homePannedRef = useRef(false);
  useEffect(() => {
    if (homePannedRef.current) return;
    if (radar.selectedCity) return; // user already has a city
    if (!homeRisk.coords || !profile?.location) return;
    homePannedRef.current = true;
    const cityName = profile.location.split(",")[0].trim();
    radar.setSelectedCity({
      name: cityName,
      lat: homeRisk.coords.lat,
      lon: homeRisk.coords.lon,
    });
  }, [homeRisk.coords, profile?.location, radar.selectedCity, radar]);


  // Build the 5 sounding boxes from useSoundingData, including WRS contributions.
  // Weights (sum to 100): CAPE 35, LI 25, CIN 15, LCL 15, BLH 10.
  const { soundingNodes, physicalNodes, threatLevel } = useMemo(() => {
    const stationActive = radar.selectedStation !== null && !sounding.loading;

    const fmt = (v: number | null, digits = 0): string => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      return digits > 0 ? v.toFixed(digits) : Math.round(v).toLocaleString();
    };

    // LIFTED INDEX is a dimensionless stability index (not a temperature),
    // so it is never unit-converted between °C and °F.
    const fmtLI = (v: number | null, digits = 1): string => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      return v.toFixed(digits);
    };

    // Convert and format length-in-meters (LCL, BL HEIGHT) — flips with unit system
    const fmtLenM = (v: number | null): string => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      const d = displayLengthM(v, unitSystem);
      return d ? Math.round(d.value).toLocaleString() : "ERR";
    };
    const lenUnit = unitSystem === "metric" ? "m" : "ft";

    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

    // Per-parameter normalized severity scores (0..1), then weighted to %
    // CAPE: 0 → 0, 4000 → 1
    const capeScore = sounding.cape != null ? clamp01(sounding.cape / 4000) : 0;
    // CIN (inverted): 0 → 1 (no inhibition, most dangerous), -200 → 0
    const cinScore = sounding.cin != null ? clamp01(1 - Math.abs(sounding.cin) / 200) : 0;
    // LI: 6 → 0, -8 → 1
    const liScore = sounding.li != null ? clamp01((6 - sounding.li) / 14) : 0;
    // BL height: 0 → 0, 3000 → 1
    const blhScore = sounding.blh != null ? clamp01(sounding.blh / 3000) : 0;
    // LCL (inverted): 0 → 1, 2000 → 0
    const lclScore = sounding.lcl != null ? clamp01(1 - sounding.lcl / 2000) : 0;

    // PHYSICAL inputs — independent environmental moisture & mid-level motion.
    // Wind gusts were dropped because they're a *consequence* of convection,
    // which would couple the WRS to the very thing it's trying to predict.
    //   rhSfcScore  = clamp01((rhSurface - 30) / 70)   // 30%→0, 100%→1
    //   rhMidScore  = clamp01((rhMid - 20) / 60)       // 20%→0, 80%→1
    //   liftScore   = clamp01(omegaMid / 0.2)          // Open-Meteo m/s, +up.
    //                 Saturation calibrated from 22 d × 8 US sites: p99≈+0.18,
    //                 max≈+0.72 m/s. Subsidence (≤0) → 0; 0.1 m/s → ~0.5;
    //                 ≥0.2 m/s strong ascent → 1.
    const rhSfcScore = sounding.rhSurface != null ? clamp01((sounding.rhSurface - 30) / 70) : 0;
    const rhMidScore = sounding.rhMid != null ? clamp01((sounding.rhMid - 20) / 60) : 0;
    const liftScore = sounding.omegaMid != null ? clamp01(sounding.omegaMid / 0.2) : 0;


    // CAPE-gated log multiplier on virtual ingredients (LI/CIN/LCL/BLH).
    // g(c) = ln(1 + 9c) / ln(10) — rises fast at low CAPE, plateaus near full.
    const capeGate = Math.log(1 + 9 * capeScore) / Math.log(10);
    const capeContrib = stationActive ? Math.round(capeScore * 35) : 0;
    const liContribRaw = stationActive ? liScore * 25 * capeGate : 0;
    const cinContribRaw = stationActive ? cinScore * 15 * capeGate : 0;
    const lclContribRaw = stationActive ? lclScore * 15 * capeGate : 0;
    const blhContribRaw = stationActive ? blhScore * 10 * capeGate : 0;

    // PHYSICAL GATE on the virtual block's combined output. Weighted blend:
    //   SFC RH 45%, MID RH 30%, MID LIFT (anti-subsidence) 25%.
    //   physGate = ln(1 + 9*physScore) / ln(10)  — same log shape as CAPE gate.
    const PHYS_W = { sfc: 0.45, mid: 0.30, lift: 0.25 } as const;
    const physScore = clamp01(
      PHYS_W.sfc * rhSfcScore + PHYS_W.mid * rhMidScore + PHYS_W.lift * liftScore,
    );
    const physGate = Math.log(1 + 9 * physScore) / Math.log(10);


    const liContrib = Math.round(liContribRaw * physGate);
    const cinContrib = Math.round(cinContribRaw * physGate);
    const lclContrib = Math.round(lclContribRaw * physGate);
    const blhContrib = Math.round(blhContribRaw * physGate);
    const capeContribGated = Math.round(capeContrib * physGate);

    // Unified color scale tied to each parameter's normalized severity score.
    // The redder the value, the more it pushes the WRS score upward.
    const colorFromScore = (score: number, hasValue: boolean): string => {
      if (!stationActive || !hasValue) return "text-neon-green";
      if (score >= 0.75) return "text-neon-red";
      if (score >= 0.5) return "text-orange-500";
      if (score >= 0.25) return "text-yellow-400";
      return "text-neon-green";
    };

    const nodes = [
      { label: "CAPE", value: fmt(sounding.cape), unit: "J/kg", color: colorFromScore(capeScore, sounding.cape !== null), wrsContribution: capeContribGated },
      { label: "CIN", value: fmt(sounding.cin), unit: "J/kg", color: colorFromScore(cinScore, sounding.cin !== null), wrsContribution: cinContrib },
      { label: "LIFTED INDEX", value: fmtLI(sounding.li, 1), unit: "", color: colorFromScore(liScore, sounding.li !== null), wrsContribution: liContrib },
      { label: "BL HEIGHT", value: fmtLenM(sounding.blh), unit: lenUnit, color: colorFromScore(blhScore, sounding.blh !== null), wrsContribution: blhContrib },
      { label: "LCL", value: fmtLenM(sounding.lcl), unit: lenUnit, color: colorFromScore(lclScore, sounding.lcl !== null), wrsContribution: lclContrib },
    ];

    // Physical metrics — independent enabling inputs. Triangle % = each
    // parameter's weighted contribution to physScore (sums to ≤100).
    const fmtPhys = (v: number | null, digits = 1) => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      return v.toFixed(digits);
    };
    const physicalNodes = [
      { label: "SFC RH", value: fmtPhys(sounding.rhSurface, 0), unit: "%", color: colorFromScore(rhSfcScore, sounding.rhSurface != null), wrsContribution: stationActive ? Math.round(rhSfcScore * PHYS_W.sfc * 100) : 0 },
      { label: "MID RH", value: fmtPhys(sounding.rhMid, 0), unit: "%", color: colorFromScore(rhMidScore, sounding.rhMid != null), wrsContribution: stationActive ? Math.round(rhMidScore * PHYS_W.mid * 100) : 0 },
      { label: "MID LIFT", value: fmtPhys(sounding.omegaMid, 2), unit: "m/s", color: colorFromScore(liftScore, sounding.omegaMid != null), wrsContribution: stationActive ? Math.round(liftScore * PHYS_W.lift * 100) : 0 },
    ];

    const threat = Math.min(100, capeContribGated + liContrib + cinContrib + lclContrib + blhContrib);
    return { soundingNodes: nodes, physicalNodes, threatLevel: threat };
  }, [sounding, radar.selectedStation, unitSystem]);

  // Derive weather condition from live threat level
  const weatherCondition: WeatherCondition = useMemo(() => {
    if (threatLevel > 85) return "stormy";
    if (threatLevel >= 61) return "rainy";
    if (threatLevel >= 31) return "cloudy";
    return "sunny";
  }, [threatLevel]);


  // Nearest most-dangerous warning polygon to the user's home city.
  const nearestDanger = useMemo(() => {
    const coords = homeRisk.coords;
    if (!coords || warningPolygons.polygons.length === 0) return null;
    let bestRank = -1;
    let bestDist = Infinity;
    let bestEvent = "";
    for (const p of warningPolygons.polygons) {
      const r = rankWarning(p);
      if (r === null) continue;
      if (r < bestRank) continue;
      const d = nearestVertexKm(coords, p.geometry);
      if (r > bestRank || d < bestDist) {
        bestRank = r;
        bestDist = d;
        // Use a more descriptive label for emergencies / PDS.
        const text = `${p.description} ${p.headline} ${p.parameters?.spcWatchTitle ?? ""} ${p.parameters?.spcPds ?? ""}`.toLowerCase();
        if (p.event === "Tornado Warning" && text.includes("tornado emergency")) {
          bestEvent = "Tornado Emergency";
        } else if (p.event === "Flash Flood Warning" && text.includes("flash flood emergency")) {
          bestEvent = "Flash Flood Emergency";
        } else if (/particularly dangerous situation|\bpds\b/.test(text)) {
          bestEvent = `PDS ${p.event}`;
        } else {
          bestEvent = p.event;
        }
      }
    }
    if (bestRank < 0) return null;
    return { event: bestEvent, distanceKm: bestDist };
  }, [warningPolygons.polygons, homeRisk.coords]);

  return (
    <motion.section ref={ref} layout className="relative overflow-hidden flex-1">
      {/* Weather-responsive background */}
      <AnimatePresence mode="wait">
        <motion.img
          key={weatherCondition}
          src={weatherBackgrounds[weatherCondition]}
          alt={`${weatherCondition} weather`}
          className="absolute inset-0 w-full h-full object-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          width={1600}
          height={900}
          decoding="async"
          // @ts-expect-error fetchpriority is a valid HTML attribute not yet in React types
          fetchpriority="high"
        />
      </AnimatePresence>

      <div className="absolute inset-0 bg-background/15" />

      {loadingTooLong && !appReady && (
        <div
          className="absolute z-50 left-1/2 -translate-x-1/2 top-3 px-3 py-1.5 rounded glass-panel pointer-events-none"
          style={{ color: "#ff6b6b", fontSize: "10px", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.05em" }}
        >
          TAKING LONGER THAN USUAL — RECOVERING…
        </div>
      )}

      <div
        className="absolute z-20 origin-bottom-left transition-transform duration-300 ease-in-out"
        style={{
          left: radarExpanded ? "0.75rem" : "clamp(0.75rem, 2vw, 1.5rem)",
          bottom: radarExpanded ? undefined : "1rem",
          top: radarExpanded ? "0.75rem" : undefined,
          transform: radarExpanded ? undefined : `scale(${overlayScale})`,
        }}
      >
        <AnimatePresence mode="wait">
          {radarExpanded ? (
            <motion.div
              key="expanded"
              initial={{ scale: 0.3, opacity: 0, originX: 0, originY: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 200 }}
            >
              <Suspense fallback={<div className="glass-panel rounded" style={{ width: "min(65vw, 620px)", height: "min(65vw, 620px)" }} />}>
                <RadarMiniMap
                  expanded
                  onCollapse={() => setRadarExpanded(false)}
                  selectedCity={radar.selectedCity}
                  setSelectedCity={radar.setSelectedCity}
                  selectedStation={radar.selectedStation}
                  setSelectedStation={radar.setSelectedStation}
                  onStationMarkerSelect={radar.selectStationByMarker}
                  stationDistanceKm={radar.stationDistanceKm}
                  selectedProduct={radar.selectedProduct}
                  setSelectedProduct={radar.setSelectedProduct}
                  tileUrl={radar.tileUrl}
                />
              </Suspense>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Suspense fallback={<div className="rounded-full glass-panel" style={{ width: "clamp(160px, 18vw, 240px)", height: "clamp(160px, 18vw, 240px)" }} />}>
                <RadarMiniMap
                  expanded={false}
                  onCollapse={() => setRadarExpanded(true)}
                  selectedCity={radar.selectedCity}
                  setSelectedCity={radar.setSelectedCity}
                  selectedStation={radar.selectedStation}
                  setSelectedStation={radar.setSelectedStation}
                  onStationMarkerSelect={radar.selectStationByMarker}
                  stationDistanceKm={radar.stationDistanceKm}
                  selectedProduct={radar.selectedProduct}
                  setSelectedProduct={radar.setSelectedProduct}
                  tileUrl={radar.tileUrl}
                />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Home-city SPC risk strip — spans CAPE → LCL */}
      {user && (() => {
        const RISK_TEXT: Record<SPCRiskLevel, string> = {
          NONE: "No Severe Risk",
          TSTM: "General Thunderstorm",
          MRGL: "Marginal Risk",
          SLGT: "Slight Risk",
          ENH: "Enhanced Risk",
          MDT: "Moderate Risk",
          HIGH: "High Risk",
        };
        // Pastel green / green / yellow / orange / red / purple
        const RISK_BG: Record<SPCRiskLevel, string> = {
          NONE: "hsl(120 45% 70%)",
          TSTM: "hsl(120 45% 70%)",
          MRGL: "hsl(120 60% 40%)",
          SLGT: "hsl(50 95% 55%)",
          ENH: "hsl(28 95% 55%)",
          MDT: "hsl(0 80% 50%)",
          HIGH: "hsl(280 70% 55%)",
        };
        const hasLocation = !!profile?.location;
        const bg = hasLocation ? RISK_BG[homeRisk.risk] : "hsl(0 80% 50%)";

        let text: string;
        if (!hasLocation) {
          text = "Please choose a hometown from the account center portal";
        } else {
          text = `Now in your home city of ${profile!.location}: ${RISK_TEXT[homeRisk.risk]}.`;
          if (nearestDanger) {
            const km = nearestDanger.distanceKm;
            const useMiles = unitSystem === "imperial";
            const val = useMiles ? km * 0.621371 : km;
            const unit = useMiles ? "mi" : "km";
            const formatted = val < 10 ? val.toFixed(1) : Math.round(val).toLocaleString();
            text += ` Nearest ${nearestDanger.event}: ${formatted} ${unit} away.`;
          }
        }

        return (
          <div
            className="absolute bottom-[13.5rem] right-4 z-10 transition-all duration-300 ease-in-out"
            style={{
              left: `calc((clamp(0.75rem, 2vw, 1.5rem) + clamp(160px, 18vw, 240px) + 1rem) * ${overlayScale})`,
            }}
          >
            <div
              className="px-3 py-1.5 border-l-2 flex items-center gap-2 overflow-hidden"
              style={{ background: bg, borderLeftColor: bg }}
            >
              <MarqueeText
                text={text}
                className="text-[10px] font-mono font-bold text-background uppercase tracking-wide"
              />
            </div>
          </div>
        );
      })()}

      {/* Current-location hazards moved to the left side panel (LeftSidePanel). */}




      {/* Virtual metrics – sounding-derived instability ingredients */}
      <div
        className="absolute bottom-[9.5rem] right-4 z-10 transition-all duration-300 ease-in-out"
        style={{
          left: `calc((clamp(0.75rem, 2vw, 1.5rem) + clamp(160px, 18vw, 240px) + 1rem) * ${overlayScale})`,
        }}
      >
        
        <div className="flex gap-2 justify-between">
          {soundingNodes.map((node) => (
            <div
              key={node.label}
              className="relative flex-1 px-3 py-3 bg-background border-l-2 border-primary/30 flex flex-col gap-1 overflow-visible"
            >
              <span className="text-[8px] font-mono text-muted-foreground leading-none">{node.label}</span>
              <span className={`text-sm font-mono font-bold ${node.color} whitespace-nowrap`}>
                {node.value}
                <span className="text-[8px] text-muted-foreground ml-0.5">{node.unit}</span>
              </span>
              {/* WRS contribution triangle */}
              <div
                className="absolute right-0 top-0 h-full"
                style={{
                  width: "28px",
                  clipPath: "polygon(100% 0, 100% 100%, 0 50%)",
                  background: "hsl(0 0% 92%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingLeft: "9px",
                }}
              >
                <span className="text-[11px] font-mono font-bold text-background leading-none" style={{ marginRight: "3px" }}>
                  {node.wrsContribution}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Physical metrics – surface-felt parameters that gate the virtual block */}
      <div
        className="absolute bottom-[5.5rem] right-4 z-10 transition-all duration-300 ease-in-out"
        style={{
          left: `calc((clamp(0.75rem, 2vw, 1.5rem) + clamp(160px, 18vw, 240px) + 1rem) * ${overlayScale})`,
        }}
      >
        
        <div className="flex gap-2 justify-between">
          {physicalNodes.map((node) => (
            <div
              key={node.label}
              className="relative flex-1 px-3 py-2 bg-background border-l-2 border-primary/30 flex flex-col gap-1 overflow-visible"
            >
              <span className="text-[8px] font-mono text-muted-foreground leading-none">{node.label}</span>
              <span className={`text-sm font-mono font-bold ${node.color} whitespace-nowrap`}>
                {node.value}
                <span className="text-[8px] text-muted-foreground ml-0.5">{node.unit}</span>
              </span>
              <div
                className="absolute right-0 top-0 h-full"
                style={{
                  width: "28px",
                  clipPath: "polygon(100% 0, 100% 100%, 0 50%)",
                  background: "hsl(0 0% 92%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingLeft: "9px",
                }}
              >
                <span className="text-[11px] font-mono font-bold text-background leading-none" style={{ marginRight: "3px" }}>
                  {node.wrsContribution}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* WRS (Weather Risk Score) bar */}
      <div
        className="absolute bottom-4 z-10 transition-all duration-300 ease-in-out"
        style={{
          left: `calc((clamp(0.75rem, 2vw, 1.5rem) + clamp(160px, 18vw, 240px) + 1rem) * ${overlayScale})`,
          right: "calc(1rem + 160px + 0.5rem)",
        }}
      >
        <div
          className="bg-background px-3 flex items-center gap-3"
          style={{ height: `calc(50px * ${overlayScale})` }}
        >
          <span className="text-[9px] font-mono text-muted-foreground whitespace-nowrap">WRS</span>
          <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background:
                  threatLevel > 85
                    ? "hsl(var(--neon-red))"
                    : threatLevel >= 61
                      ? "hsl(var(--neon-amber))"
                      : threatLevel >= 31
                        ? "hsl(var(--primary))"
                        : "hsl(var(--neon-green))",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${threatLevel}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <span
            className={`text-sm font-mono font-bold whitespace-nowrap ${
              threatLevel > 85
                ? "text-neon-red"
                : threatLevel >= 61
                  ? "text-neon-amber"
                  : threatLevel >= 31
                    ? "text-primary"
                    : "text-neon-green"
            }`}
          >
            {threatLevel}
          </span>
        </div>
      </div>

      <LeftRightHazardOverlays overlayScale={overlayScale} />
    </motion.section>
  );
});

TacticalMap.displayName = "TacticalMap";

export default TacticalMap;

/**
 * Left and right hazard overlay panels.
 *
 * The left wrapper holds the Top 5 Hazards + New Warnings stack and is
 * sized purely by its own content. We measure its rendered height with a
 * ResizeObserver and apply the same height (divided by overlayScale, so the
 * post-scale visual height matches) as a maxHeight on the right wrapper.
 *
 * Result: the bottom edge of the Top 6 Most Dangerous panel always lines
 * up with the bottom of the New Warnings card. When the right panel's
 * content exceeds that height, it scrolls internally (no page scroll).
 */
const PANEL_GAP = 12;

function LeftRightHazardOverlays({ overlayScale }: { overlayScale: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const commonRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLDivElement>(null);
  const dangerousRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const GAP = PANEL_GAP;
    const RATIO = 0.405;

    function recalculate() {
      // Reference height = raw height of the tactical map section
      // (top to bottom), regardless of background image cover-fit.
      const parent = containerRef.current?.offsetParent as HTMLElement | null;
      const availableH = parent?.offsetHeight ?? window.innerHeight;
      // Combined left stack (Top 5 + GAP + New Warnings) occupies RATIO of
      // the section height. Each individual panel is therefore half of
      // (combinedH - GAP).
      const combinedH = Math.floor(availableH * RATIO);
      const panelH = Math.max(0, Math.floor((combinedH - GAP) / 2));

      if (commonRef.current) {
        commonRef.current.style.height = `${panelH}px`;
        commonRef.current.style.maxHeight = `${panelH}px`;
      }
      if (newRef.current) {
        newRef.current.style.height = `${panelH}px`;
        newRef.current.style.maxHeight = `${panelH}px`;
      }
      if (dangerousRef.current) {
        dangerousRef.current.style.height = `${combinedH}px`;
        dangerousRef.current.style.maxHeight = `${combinedH}px`;
      }
    }

    const parent = containerRef.current?.offsetParent as HTMLElement | null;
    const observer = new ResizeObserver(recalculate);
    if (parent) observer.observe(parent);

    recalculate();
    return () => observer.disconnect();
  }, []);

  // Shared scrollbar styling for all three panels. Heights are set
  // imperatively by the useEffect above — do not set max-height in CSS.
  const scrollStyle: React.CSSProperties = {
    overflowY: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(100, 200, 255, 0.3) transparent",
  };

  const leftPanelStyle: React.CSSProperties = {
    ...scrollStyle,
    flexShrink: 0,
    minHeight: 0,
  };

  const dangerousStyle: React.CSSProperties = {
    ...scrollStyle,
    flexShrink: 0,
    minHeight: 0,
  };

  return (
    <>
      {/* Zero-size sentinel used to measure the parent map container. */}
      <div ref={containerRef} className="absolute inset-0 pointer-events-none" aria-hidden />

      <div
        className="absolute top-3 left-3 z-10 origin-top-left transition-all duration-300 ease-in-out"
        style={{ transform: `scale(${overlayScale})` }}
      >
        <EventInfoPanel
          show="hazards"
          hazardsRef={commonRef}
          newWarningsRef={newRef}
          hazardsStyle={leftPanelStyle}
          newWarningsStyle={leftPanelStyle}
          stackGapPx={PANEL_GAP}
        />
      </div>

      <div
        className="absolute top-3 right-3 z-10 origin-top-right transition-all duration-300 ease-in-out"
        style={{ transform: `scale(${overlayScale})` }}
      >
        <EventInfoPanel
          show="dangerous"
          dangerousRef={dangerousRef}
          dangerousStyle={dangerousStyle}
        />
      </div>
    </>
  );
}
