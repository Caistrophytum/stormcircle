import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, Minimize2, Wind, CloudHail, Eye } from "lucide-react";
import RadarCodePanel from "./RadarCodePanel";
import RadarMiniMap from "./RadarMiniMap";

import weatherCalm from "@/assets/weather-calm.jpg";
import weatherOvercast from "@/assets/weather-overcast.jpg";
import weatherStormy from "@/assets/weather-stormy.jpg";

type WeatherCondition = "calm" | "overcast" | "stormy";

const weatherBackgrounds: Record<WeatherCondition, string> = {
  calm: weatherCalm,
  overcast: weatherOvercast,
  stormy: weatherStormy,
};

const reportButtons = [
  { label: "GALE", category: "WIND", icon: Wind, color: "neon-amber" },
  { label: "HAIL", category: "PRECIP", icon: CloudHail, color: "neon-red" },
  { label: "FOG", category: "VISIB", icon: Eye, color: "neon-blue" },
];

interface Props {
  expanded: boolean;
  onToggleExpand: () => void;
}

const TacticalMap = ({ expanded, onToggleExpand }: Props) => {
  const [weatherCondition, setWeatherCondition] = useState<WeatherCondition>("stormy");
  const [radarExpanded, setRadarExpanded] = useState(false);

  const conditions: WeatherCondition[] = ["calm", "overcast", "stormy"];

  return (
    <motion.section
      layout
      className={`relative overflow-hidden shrink-0 ${expanded ? "flex-1" : ""}`}
      style={expanded ? {} : { height: "55%" }}
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

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-background/50" />

      {/* Expand/collapse toggle */}
      <button
        onClick={onToggleExpand}
        className="absolute top-3 right-3 z-20 glass-panel p-[clamp(4px,0.5vw,6px)] hover:border-primary/50 transition-colors"
        title={expanded ? "Collapse map" : "Expand map"}
      >
        {expanded ? <Minimize2 className="size-[clamp(12px,1vw,14px)] text-primary" /> : <Maximize2 className="size-[clamp(12px,1vw,14px)] text-primary" />}
      </button>

      {/* Weather condition selector */}
      <div className="absolute top-3 right-14 z-20 flex gap-1">
        {conditions.map((c) => (
          <button
            key={c}
            onClick={() => setWeatherCondition(c)}
            className={`px-[clamp(4px,0.8vw,8px)] py-[clamp(2px,0.4vw,4px)] text-[clamp(7px,0.7vw,9px)] font-mono uppercase tracking-wider transition-all ${
              weatherCondition === c
                ? "glass-panel border-primary/50 text-primary"
                : "glass-panel text-muted-foreground hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Radar code panel - top left */}
      <div className="absolute top-3 left-3 z-10">
        <RadarCodePanel />
      </div>

      {/* Expandable Radar Mini-Map - bottom left */}
      <div className="absolute bottom-4 left-4 z-20">
        <AnimatePresence mode="wait">
          {radarExpanded ? (
            <motion.div
              key="expanded"
              className="absolute bottom-0 left-0"
              initial={{ scale: 0.3, opacity: 0, originX: 0, originY: 1 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 200 }}
              style={{ width: "calc(100vw - 400px)", height: "calc(100vh - 160px)", maxWidth: 900, maxHeight: 600 }}
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

      {/* Quick report buttons */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-[clamp(4px,0.5vw,8px)] z-10">
        {reportButtons.map((btn) => (
          <button
            key={btn.label}
            className="px-[clamp(8px,1.5vw,16px)] py-[clamp(4px,0.8vw,8px)] glass-panel hover:border-primary/50 transition-all group flex flex-col items-center gap-0.5"
          >
            <span className="text-[clamp(7px,0.7vw,9px)] font-mono text-muted-foreground group-hover:text-primary transition-colors">
              {btn.category}
            </span>
            <span className="text-[clamp(10px,1vw,14px)] font-mono text-card-foreground tracking-widest">
              {btn.label}
            </span>
          </button>
        ))}
        <button className="px-[clamp(8px,1.5vw,16px)] py-[clamp(4px,0.8vw,8px)] bg-primary text-primary-foreground font-bold flex flex-col items-center gap-0.5 neon-glow-amber hover:brightness-110 transition-all rounded-sm">
          <span className="text-[clamp(7px,0.7vw,9px)] font-mono tracking-tighter opacity-70">EMERGENCY</span>
          <span className="text-[clamp(10px,1vw,14px)] font-mono tracking-widest">TORNADO</span>
        </button>
      </div>
    </motion.section>
  );
};

export default TacticalMap;
