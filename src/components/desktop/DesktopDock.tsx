/**
 * DesktopDock — the 4-tab glassy panel that sits at the bottom-right of the
 * screen (left of FloatingChat). Handles tab switching with smooth motion.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gauge, ShieldAlert, Bot, Radar as RadarIcon } from "lucide-react";
import MetricsTab from "./tabs/MetricsTab";
import SituationTab from "./tabs/SituationTab";
import BotsTab from "./tabs/BotsTab";
import RadarReportsTab from "./tabs/RadarReportsTab";

type TabId = "metrics" | "situation" | "bots" | "radar";

const TABS: { id: TabId; label: string; Icon: typeof Gauge; accent: string }[] = [
  { id: "metrics", label: "Hometown Metrics", Icon: Gauge, accent: "255,157,0" },
  { id: "situation", label: "Hometown Situation", Icon: ShieldAlert, accent: "255,80,80" },
  { id: "bots", label: "Bot Network", Icon: Bot, accent: "125,211,252" },
  { id: "radar", label: "Radar & Reports", Icon: RadarIcon, accent: "142,255,180" },
];

export default function DesktopDock() {
  const [tab, setTab] = useState<TabId>("metrics");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.1, type: "spring", damping: 24 }}
      id="desktop-dock"
      className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl"
      style={{
        width: "calc((100vw - 56px) / 3)",
        maxHeight: "calc(100dvh - 96px)",
        background: "rgba(18,18,22,0.72)",
        backdropFilter: "blur(24px)",
        border: `1px solid rgba(${active.accent},0.35)`,
        boxShadow: `0 0 32px rgba(${active.accent},0.2), 0 20px 40px rgba(0,0,0,0.5)`,
        transition: "border-color 500ms ease, box-shadow 500ms ease",
      }}
    >
      {/* Tab bar */}
      <div
        className="flex gap-1 border-b p-2"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        {TABS.map((t) => {
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-all"
              style={{
                background: isActive ? `rgba(${t.accent},0.15)` : "transparent",
                border: isActive
                  ? `1px solid rgba(${t.accent},0.5)`
                  : "1px solid transparent",
                color: isActive ? `rgb(${t.accent})` : "hsl(0 0% 55%)",
                boxShadow: isActive
                  ? `inset 0 0 12px rgba(${t.accent},0.15), 0 0 8px rgba(${t.accent},0.2)`
                  : undefined,
              }}
            >
              <t.Icon size={12} />
              <span className="hidden sm:inline">{t.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "metrics" && <MetricsTab />}
            {tab === "situation" && <SituationTab />}
            {tab === "bots" && <BotsTab />}
            {tab === "radar" && <RadarReportsTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
