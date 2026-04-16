import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, Minimize2, Wind, CloudHail, Eye } from "lucide-react";
import RadarCodePanel from "./RadarCodePanel";
import RadarMiniMap from "./RadarMiniMap";

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
  return (
    <motion.section
      layout
      className={`relative bg-background avionics-grid overflow-hidden shrink-0 ${
        expanded ? "flex-1" : ""
      }`}
      style={expanded ? {} : { height: "55%" }}
    >
      {/* Expand/collapse toggle */}
      <button
        onClick={onToggleExpand}
        className="absolute top-3 right-3 z-20 glass-panel p-1.5 hover:border-primary/50 transition-colors"
        title={expanded ? "Collapse map" : "Expand map"}
      >
        {expanded ? <Minimize2 className="size-3.5 text-primary" /> : <Maximize2 className="size-3.5 text-primary" />}
      </button>

      {/* Simulated radar overlay */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

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

      {/* Radar code panel (replaces scanning radial) */}
      <div className="absolute top-3 left-3 z-10">
        <RadarCodePanel />
      </div>

      {/* Radar mini-map with info nodes */}
      <div className="absolute top-3 left-[260px] z-10">
        <RadarMiniMap />
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
