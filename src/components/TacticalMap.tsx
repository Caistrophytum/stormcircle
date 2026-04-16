import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, Minimize2, Wind, CloudHail, Eye } from "lucide-react";
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

const reportButtons = [
  { label: "GALE", category: "WIND", icon: Wind, color: "neon-amber" },
  { label: "HAIL", category: "PRECIP", icon: CloudHail, color: "neon-red" },
  { label: "FOG", category: "VISIB", icon: Eye, color: "neon-blue" },
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

      <div className="absolute inset-0 bg-background/50" />

      <div
        className="absolute top-3 right-3 z-20 origin-top-right"
        style={{ transform: `scale(${overlayScale})` }}
      >
        <button
          onClick={onToggleExpand}
          className="glass-panel p-1.5 hover:border-primary/50 transition-colors"
          title={expanded ? "Collapse map" : "Expand map"}
        >
          {expanded ? <Minimize2 className="size-3.5 text-primary" /> : <Maximize2 className="size-3.5 text-primary" />}
        </button>
      </div>

      <div
        className="absolute top-3 right-14 z-20 flex gap-1 origin-top-right"
        style={{ transform: `scale(${overlayScale})` }}
      >
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

      <div
        className="absolute top-3 left-3 z-10 origin-top-left"
        style={{ transform: `scale(${overlayScale})` }}
      >
        <RadarCodePanel />
      </div>

      <div
        className="absolute right-3 z-10 origin-top-right transition-all duration-300 ease-in-out"
        style={{
          top: `calc(2.5rem * ${overlayScale} + 0.75rem)`,
          transform: `scale(${overlayScale})`,
        }}
      >
        <EventInfoPanel />
      </div>

      <div
        className="absolute bottom-4 z-20 origin-bottom-left"
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

      <div
        className="absolute bottom-4 z-10 origin-bottom-left"
        style={{
          left: `calc((clamp(0.75rem, 2vw, 1.5rem) * 2 + clamp(200px, 22vw, 340px)) * ${overlayScale})`,
          transform: `scale(${overlayScale})`,
        }}
      >
        <div className="flex gap-2">
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
      </div>
    </motion.section>
  );
};

export default TacticalMap;
