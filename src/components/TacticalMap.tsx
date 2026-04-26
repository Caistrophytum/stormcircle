import { forwardRef, useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import RadarMiniMap from "./RadarMiniMap";
import EventInfoPanel from "./EventInfoPanel";
import { useWeatherData } from "@/hooks/useWeatherData";
import { useRadar } from "@/hooks/useRadar";
import { useSoundingData } from "@/hooks/useSoundingData";
import {
  useUnitSystem,
  displayTemp,
  displayLengthM,
} from "@/hooks/useUnitSystem";

import weatherSunny from "@/assets/weather-calm.jpg";
import weatherCloudy from "@/assets/weather-overcast.jpg";
import weatherRainy from "@/assets/weather-rainy.jpg";
import weatherStormy from "@/assets/weather-stormy.jpg";

type WeatherCondition = "sunny" | "cloudy" | "rainy" | "stormy";

const weatherBackgrounds: Record<WeatherCondition, string> = {
  sunny: weatherSunny,
  cloudy: weatherCloudy,
  rainy: weatherRainy,
  stormy: weatherStormy,
};

interface Props {
  overlayScale: number;
}

const TacticalMap = forwardRef<HTMLElement, Props>(({ overlayScale }, ref) => {
  const { data } = useWeatherData(15000);
  const [radarExpanded, setRadarExpanded] = useState(false);
  const radar = useRadar();
  const sounding = useSoundingData(
    radar.selectedCity ? { lat: radar.selectedCity.lat, lon: radar.selectedCity.lon } : null,
  );
  const unitSystem = useUnitSystem();

  // Build the 5 sounding boxes from useSoundingData, including WRS contributions.
  // Weights (sum to 100): CAPE 35, LI 25, CIN 15, LCL 15, BLH 10.
  const { soundingNodes, threatLevel } = useMemo(() => {
    const stationActive = radar.selectedStation !== null && !sounding.loading;

    const fmt = (v: number | null, digits = 0): string => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      return digits > 0 ? v.toFixed(digits) : Math.round(v).toLocaleString();
    };

    // Convert and format temperature (LIFTED INDEX) — flips with unit system
    const fmtTemp = (v: number | null, digits = 1): string => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      const d = displayTemp(v, unitSystem);
      return d ? d.value.toFixed(digits) : "ERR";
    };
    const tempUnit = unitSystem === "metric" ? "°C" : "°F";

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

    const capeContrib = stationActive ? Math.round(capeScore * 35) : 0;
    const liContrib = stationActive ? Math.round(liScore * 25) : 0;
    const cinContrib = stationActive ? Math.round(cinScore * 15) : 0;
    const lclContrib = stationActive ? Math.round(lclScore * 15) : 0;
    const blhContrib = stationActive ? Math.round(blhScore * 10) : 0;

    const capeColor = (() => {
      if (!stationActive || sounding.cape === null) return "text-neon-green";
      if (sounding.cape > 2500) return "text-neon-red";
      if (sounding.cape >= 1000) return "text-yellow-400";
      return "text-neon-green";
    })();

    const liColor = (() => {
      if (!stationActive || sounding.li === null) return "text-neon-green";
      if (sounding.li < -6) return "text-neon-red";
      if (sounding.li < -3) return "text-orange-500";
      if (sounding.li <= 0) return "text-yellow-400";
      return "text-neon-green";
    })();

    const nodes = [
      { label: "CAPE", value: fmt(sounding.cape), unit: "J/kg", color: capeColor, wrsContribution: capeContrib },
      { label: "CIN", value: fmt(sounding.cin), unit: "J/kg", color: "text-neon-green", wrsContribution: cinContrib },
      { label: "LIFTED INDEX", value: fmtTemp(sounding.li, 1), unit: tempUnit, color: liColor, wrsContribution: liContrib },
      { label: "BL HEIGHT", value: fmtLenM(sounding.blh), unit: lenUnit, color: "text-neon-green", wrsContribution: blhContrib },
      { label: "LCL", value: fmtLenM(sounding.lcl), unit: lenUnit, color: "text-neon-green", wrsContribution: lclContrib },
    ];

    const threat = Math.min(100, capeContrib + liContrib + cinContrib + lclContrib + blhContrib);
    return { soundingNodes: nodes, threatLevel: threat };
  }, [sounding, radar.selectedStation, unitSystem]);

  // Derive weather condition from live threat level
  const weatherCondition: WeatherCondition = useMemo(() => {
    if (threatLevel > 85) return "stormy";
    if (threatLevel >= 61) return "rainy";
    if (threatLevel >= 31) return "cloudy";
    return "sunny";
  }, [threatLevel]);

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
          width={1920}
          height={1080}
        />
      </AnimatePresence>

      <div className="absolute inset-0 bg-background/15" />

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
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Data nodes – full width to right edge */}
      <div
        className="absolute bottom-[5.5rem] right-4 z-10 transition-all duration-300 ease-in-out"
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
  const commonRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLDivElement>(null);
  const dangerousRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      const commonH = commonRef.current?.offsetHeight ?? 0;
      const newH = newRef.current?.offsetHeight ?? 0;
      if (dangerousRef.current) {
        dangerousRef.current.style.height = `${commonH + newH + PANEL_GAP}px`;
      }
    };
    const ro = new ResizeObserver(sync);
    if (commonRef.current) ro.observe(commonRef.current);
    if (newRef.current) ro.observe(newRef.current);
    sync();
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  // Shared scrollbar styling for all three panels.
  const scrollStyle: React.CSSProperties = {
    overflowY: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(100, 200, 255, 0.3) transparent",
  };

  // Most Common Alerts (Top 5 Hazards) and New Alerts: capped at 40.5dvh.
  const leftPanelStyle: React.CSSProperties = {
    ...scrollStyle,
    maxHeight: "40.5dvh",
    flexShrink: 1,
    minHeight: 0,
  };

  // Top 6 Most Dangerous: height set imperatively by ResizeObserver above.
  const dangerousStyle: React.CSSProperties = {
    ...scrollStyle,
    flexShrink: 0,
    minHeight: 0,
  };

  return (
    <>
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
