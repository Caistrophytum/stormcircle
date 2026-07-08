/**
 * HazardTabs — top-left tabbed hazard panel matching the DesktopDock aesthetic.
 * Three tabs: Top (most dangerous), Common (top-count hazards), New (last 5
 * refresh cycles). Width shaped by content, capped at 33vw. Height capped at
 * 50dvh. Includes a collapse toggle that leaves only the tab strip visible.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, ListOrdered, Bell, ChevronUp, ChevronDown } from "lucide-react";
import EventInfoPanel from "@/components/EventInfoPanel";

type TabId = "dangerous" | "common" | "new";

const TABS: { id: TabId; label: string; Icon: typeof Flame; accent: string }[] = [
  { id: "dangerous", label: "Top", Icon: Flame, accent: "255,80,80" },
  { id: "common", label: "Common", Icon: ListOrdered, accent: "255,157,0" },
  { id: "new", label: "New", Icon: Bell, accent: "125,211,252" },
];

export default function HazardTabs() {
  const [tab, setTab] = useState<TabId>("dangerous");
  const [collapsed, setCollapsed] = useState(false);
  const active = TABS.find((t) => t.id === tab)!;

  const scrollStyle: React.CSSProperties = {
    maxHeight: "calc(50dvh - 52px)",
    overflowY: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: `rgba(${active.accent}, 0.35) transparent`,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.1, type: "spring", damping: 24 }}
      className="pointer-events-auto flex w-[30vw] flex-col overflow-hidden rounded-2xl"
      style={{
        maxHeight: "50dvh",
        background: "rgba(18,18,22,0.72)",
        backdropFilter: "blur(24px)",
        border: `1px solid rgba(${active.accent},0.35)`,
        boxShadow: `0 0 32px rgba(${active.accent},0.2), 0 20px 40px rgba(0,0,0,0.5)`,
        transition: "border-color 500ms ease, box-shadow 500ms ease",
      }}
    >
      {/* Tab bar + collapse toggle */}
      <div
        className="flex items-center gap-1 border-b p-2"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex flex-1 gap-1">
          {TABS.map((t) => {
            const isActive = t.id === tab && !collapsed;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setCollapsed(false);
                }}
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
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand hazards" : "Collapse hazards"}
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{
            border: `1px solid rgba(${active.accent},0.4)`,
            color: `rgb(${active.accent})`,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>

      {/* Tab content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div
              className="px-4 py-2 [&_.glass-panel]:!bg-transparent [&_.glass-panel]:!border-0 [&_.glass-panel]:!p-0 [&_.glass-panel]:!shadow-none"
              style={scrollStyle}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  <EventInfoPanel show={tab} />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
