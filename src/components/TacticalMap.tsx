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
      <div className="absolute inset-0 bg-background/70" />
      <div className="absolute inset-0 avionics-grid" />

      {/* Expand/collapse toggle */}
      <button
        onClick={onToggleExpand}
        className="absolute top-3 right-3 z-20 glass-panel p-1.5 hover:border-primary/50 transition-colors"
        title={expanded ? "Collapse map" : "Expand map"}
      >
        {expanded ? <Minimize2 className="size-3.5 text-primary" /> : <Maximize2 className="size-3.5 text-primary" />}
      </button>

      {/* Weather condition selector */}
      <div className="absolute top-3 right-14 z-20 flex gap-1">
        {conditions.map((c) => (
          <button
            key={c}
            onClick={() => setWeatherCondition(c)}
            className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-all ${
              weatherCondition === c
                ? "glass-panel border-primary/50 text-primary"
                : "glass-panel text-muted-foreground hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Radar overlay elements */}
      <div className="absolute inset-0 z-[1]">
        {/* Radar circles */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {[120, 180, 240].map((size) => (
            <div
              key={size}
              className="absolute rounded-full border border-primary/10"
              style={{
                width: size,
                height: size,
                top: -size / 2,
                left: -size / 2,
              }}
            />
          ))}
          <motion.div
            className="absolute w-[240px] h-[1px] origin-left bg-gradient-to-r from-primary/30 to-transparent"
            style={{ top: 0, left: 0 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
        </div>

        {/* Weather markers */}
        {[
          { top: "30%", left: "25%", color: "bg-neon-red" },
          { top: "55%", left: "60%", color: "bg-neon-amber" },
          { top: "40%", left: "45%", color: "bg-neon-blue" },
          { top: "65%", left: "30%", color: "bg-neon-green" },
        ].map((marker, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{ top: marker.top, left: marker.left }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.2, type: "spring" }}
          >
            <div className={`size-3 rounded-full ${marker.color} animate-pulse`} />
            <div className={`absolute inset-0 size-3 rounded-full ${marker.color} opacity-30 animate-ping`} />
          </motion.div>
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
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        {reportButtons.map((btn) => (
          <button
            key={btn.label}
            className="px-4 py-2 glass-panel hover:border-primary/50 transition-all group flex flex-col items-center gap-0.5 min-w-[75px]"
          >
            <span className="text-[9px] font-mono text-muted-foreground group-hover:text-primary transition-colors">
              {btn.category}
            </span>
            <span className="text-sm font-mono text-card-foreground tracking-widest">
              {btn.label}
            </span>
          </button>
        ))}
        <button className="px-4 py-2 bg-primary text-primary-foreground font-bold flex flex-col items-center gap-0.5 min-w-[100px] neon-glow-amber hover:brightness-110 transition-all rounded-sm">
          <span className="text-[9px] font-mono tracking-tighter opacity-70">EMERGENCY</span>
          <span className="text-sm font-mono tracking-widest">TORNADO</span>
        </button>
      </div>
    </motion.section>
  );
};

export default TacticalMap;
