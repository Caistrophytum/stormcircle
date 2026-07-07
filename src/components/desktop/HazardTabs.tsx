/**
 * HazardTabs — top-left tabbed hazard panel matching the DesktopDock aesthetic.
 * Three tabs stack from the top-left corner: Top Hazards (most dangerous),
 * Most Common (by count), and New (last 5 refresh cycles).
 * Width is shaped by content, capped at 40vw. Height fits content.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, ListOrdered, Bell } from "lucide-react";
import EventInfoPanel from "@/components/EventInfoPanel";

type TabId = "dangerous" | "common" | "new";

const TABS: { id: TabId; label: string; Icon: typeof Flame; accent: string }[] = [
  { id: "dangerous", label: "Top", Icon: Flame, accent: "255,80,80" },
  { id: "common", label: "Common", Icon: ListOrdered, accent: "255,157,0" },
  { id: "new", label: "New", Icon: Bell, accent: "125,211,252" },
];

export default function HazardTabs() {
  const [tab, setTab] = useState<TabId>("dangerous");
  const active = TABS.find((t) => t.id === tab)!;

  const scrollStyle: React.CSSProperties = {
    maxHeight: "min(60dvh, 640px)",
    overflowY: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: `rgba(${active.accent}, 0.35) transparent`,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.1, type: "spring", damping: 24 }}
      className="pointer-events-auto flex w-fit max-w-[40vw] flex-col overflow-hidden rounded-2xl"
      style={{
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
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-all"
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
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content — width shaped by content, max 40vw. */}
      <div className="max-w-[40vw] p-2" style={scrollStyle}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="[&_.glass-panel]:!bg-transparent [&_.glass-panel]:!border-0 [&_.glass-panel]:!p-0 [&_.glass-panel]:!shadow-none"
          >
            {tab === "dangerous" && <EventInfoPanel show="dangerous" />}
            {tab === "common" && <SingleList kind="common" />}
            {tab === "new" && <SingleList kind="new" />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/**
 * SingleList — renders just one of the two "hazards" sub-lists from
 * EventInfoPanel by wrapping it and hiding the other. Simpler than
 * refactoring EventInfoPanel's `show` prop.
 */
function SingleList({ kind }: { kind: "common" | "new" }) {
  return (
    <div
      className={
        kind === "common"
          ? "[&>div>div:last-child]:hidden"
          : "[&>div>div:first-child]:hidden"
      }
    >
      <EventInfoPanel show="hazards" />
    </div>
  );
}
