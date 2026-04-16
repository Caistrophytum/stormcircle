import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, Minimize2 } from "lucide-react";
import RadarCodePanel from "./RadarCodePanel";
import RadarMiniMap from "./RadarMiniMap";
import EventInfoPanel from "./EventInfoPanel";

import weatherCalm from "@/assets/weather-calm.jpg";
import weatherOvercast from "@/assets/weather-overcast.jpg";
import weatherStormy from "@/assets/weather-stormy.jpg";

type WeatherCondition = "calm" | "overcast" | "stormy";

const weatherBackgrounds: Record<WeatherCondition, string> = {
  calm: weatherCalm,
  overcast: weatherOvercast,
  stormy: weatherStormy,
};

const dataNodes = [
  { label: "CAPE", value: "3,200", unit: "J/kg", color: "text-neon-red" },
  { label: "CIN", value: "-42", unit: "J/kg", color: "text-neon-blue" },
  { label: "0-6km SHEAR", value: "48", unit: "kts", color: "text-neon-amber" },
  { label: "0-1km SRH", value: "312", unit: "m²/s²", color: "text-neon-red" },
  { label: "LCL", value: "820", unit: "m", color: "text-neon-green" },
  { label: "STP", value: "4.8", unit: "", color: "text-neon-red" },
];

interface Props {
  expanded: boolean;
  onToggleExpand: () => void;
  overlayScale: number;
}

const TacticalMap = ({ expanded, onToggleExpand, overlayScale }: Props) => {
  const [weatherCondition, setWeatherCondition] = useState<WeatherCondition>("stormy");
  const [radarExpanded, setRadarExpanded] = useState(false);

  const conditions: WeatherCondition[] = ["calm", "overcast", "stormy"];

  return (
    <motion.section
      layout
      className="relative overflow-hidden flex-1"
    >
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

      <div className="absolute inset-0 bg-background/50" />


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

      {/* Data nodes – fill space between radar and right edge */}
      <div
        className="absolute bottom-4 z-10 origin-bottom-left transition-all duration-300 ease-in-out"
        style={{
          left: `calc((clamp(0.75rem, 2vw, 1.5rem) + clamp(160px, 18vw, 240px) + 1rem) * ${overlayScale})`,
          right: "1rem",
          transform: `scale(${overlayScale})`,
        }}
      >
        <div className="flex gap-2 justify-between">
          {dataNodes.map((node) => (
            <div
              key={node.label}
              className="flex-1 px-3 py-3 bg-background border-l-2 border-primary/30 flex flex-col gap-1"
            >
              <span className="text-[8px] font-mono text-muted-foreground leading-none">
                {node.label}
              </span>
              <span className={`text-sm font-mono font-bold ${node.color} whitespace-nowrap`}>
                {node.value}
                <span className="text-[8px] text-muted-foreground ml-0.5">{node.unit}</span>
              </span>
            </div>
          ))}
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

      {/* Event info panel: top-right, same height as radar code panel */}
      <div
        className="absolute top-3 right-3 z-10 origin-top-right transition-transform duration-300 ease-in-out whitespace-nowrap w-auto"
        style={{
          transform: `scale(${overlayScale})`,
        }}
      >
        <EventInfoPanel />
      </div>
    </motion.section>
  );
};

export default TacticalMap;
