import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, Minimize2 } from "lucide-react";
import RadarCodePanel from "./RadarCodePanel";
import RadarMiniMap from "./RadarMiniMap";
import EventInfoPanel from "./EventInfoPanel";
import { useWeatherData } from "@/hooks/useWeatherData";

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
  expanded: boolean;
  onToggleExpand: () => void;
  overlayScale: number;
}

const TacticalMap = ({ expanded, onToggleExpand, overlayScale }: Props) => {
  const { data } = useWeatherData(15000);
  const [radarExpanded, setRadarExpanded] = useState(false);

  // Derive weather condition from threat level
  const weatherCondition: WeatherCondition = useMemo(() => {
    if (data.threatLevel > 85) return "stormy";
    if (data.threatLevel >= 61) return "rainy";
    if (data.threatLevel >= 31) return "cloudy";
    return "sunny";
  }, [data.threatLevel]);

  return (
    <motion.section layout className="relative overflow-hidden flex-1">
      {/* Weather-responsive background */}
      <AnimatePresence mode="wait">
        <motion.img
          key={weatherCondition}
          src={weatherBackgrounds[weatherCondition]}
          alt={`${weatherCondition} weather`}
          className="absolute inset-0 w-full h-full object-fill"
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
        className="absolute bottom-4 z-20 origin-bottom-left transition-transform duration-300 ease-in-out"
        style={{
          left: "clamp(0.75rem, 2vw, 1.5rem)",
          transform: radarExpanded ? undefined : `scale(${overlayScale})`,
        }}
      >
        <AnimatePresence mode="wait">
          {radarExpanded ? (
            <motion.div
              key="expanded"
              className="absolute bottom-0 left-0"
              style={{
                width: "min(72vw, 900px)",
                aspectRatio: "9/16",
                maxWidth: "calc(100vw - 3rem)",
                maxHeight: "calc(100vh - 8rem)",
              }}
              initial={{ scale: 0.3, opacity: 0, originX: 0, originY: 1 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 200 }}
            >
              <RadarMiniMap expanded onCollapse={() => setRadarExpanded(false)} />
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <RadarMiniMap expanded={false} onCollapse={() => setRadarExpanded(true)} />
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
          {data.dataNodes.map((node) => (
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
                <span className="text-[11px] font-mono font-bold text-background leading-none">
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
                  data.threatLevel > 85
                    ? "hsl(var(--neon-red))"
                    : data.threatLevel >= 61
                      ? "hsl(var(--neon-amber))"
                      : data.threatLevel >= 31
                        ? "hsl(var(--primary))"
                        : "hsl(var(--neon-green))",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${data.threatLevel}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <span
            className={`text-sm font-mono font-bold whitespace-nowrap ${
              data.threatLevel > 85
                ? "text-neon-red"
                : data.threatLevel >= 61
                  ? "text-neon-amber"
                  : data.threatLevel >= 31
                    ? "text-primary"
                    : "text-neon-green"
            }`}
          >
            {data.threatLevel}
          </span>
        </div>
      </div>

      {/* Radar code panel: top-left */}
      <div
        className="absolute top-3 left-3 z-10 origin-top-left transition-transform duration-300 ease-in-out"
        style={{
          width: "clamp(200px, 22vw, 340px)",
          transform: `scale(${overlayScale})`,
        }}
      >
        <RadarCodePanel />
      </div>

      {/* Event info panel: top-right */}
      <div
        className="absolute top-3 right-3 z-10 origin-top-right transition-transform duration-300 ease-in-out whitespace-nowrap w-auto"
        style={{
          transform: `scale(${overlayScale})`,
        }}
      >
        <EventInfoPanel topHazards={data.topHazards} dangerousAlerts={data.dangerousAlerts} />
      </div>
    </motion.section>
  );
};

export default TacticalMap;
