/**
 * FloatingChat - bottom-right square glassy chat panel.
 * Wraps CitizenReports and flashes a white border when a new message arrives.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import CitizenReports from "@/components/CitizenReports";
import { useNewReportPing } from "@/hooks/useNewReportPing";
import type { DesktopPanelFocus } from "@/pages/Index";

interface FloatingChatProps {
  focus?: DesktopPanelFocus;
  onFocusChange?: (focus: DesktopPanelFocus) => void;
}

export default function FloatingChat({ focus = null, onFocusChange }: FloatingChatProps) {
  const ping = useNewReportPing();
  const [flash, setFlash] = useState(false);
  const collapsed = focus === "hazards";
  const expanded = focus === "chat";

  useEffect(() => {
    if (ping === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [ping]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.15, type: "spring", damping: 24 }}
      className="pointer-events-auto relative flex flex-col overflow-hidden rounded-2xl"
      style={{
        width: "calc((100vw - 56px) / 3)",
        height: collapsed ? 46 : expanded ? "calc(100dvh - 104px)" : "40dvh",
        background: "rgba(18,18,22,0.72)",
        backdropFilter: "blur(24px)",
        border: flash
          ? "1px solid rgba(255,255,255,0.95)"
          : "1px solid rgba(255,255,255,0.12)",
        boxShadow: flash
          ? "0 0 32px rgba(255,255,255,0.5), 0 20px 40px rgba(0,0,0,0.5)"
          : "0 0 20px rgba(0,0,0,0.5), 0 12px 32px rgba(0,0,0,0.5)",
        transition: "height 260ms ease, border-color 200ms ease, box-shadow 200ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => onFocusChange?.(collapsed ? null : "hazards")}
        aria-label={collapsed ? "Expand chat" : "Collapse chat"}
        title={collapsed ? "Expand chat" : "Collapse chat"}
        className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md border border-primary/40 bg-background/70 text-primary transition-colors hover:bg-primary/10"
      >
        {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      <AnimatePresence initial={false}>
        {collapsed && (
          <motion.div
            key="collapsed-chat-header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-[46px] shrink-0 items-center gap-2 px-4 font-mono text-[9px] font-bold uppercase tracking-wider text-primary"
          >
            <MessageSquare size={12} />
            <span>Public Weather Reports</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CitizenReports renders an <aside class="w-80 h-full …"> - override
          with a wrapping div that forces full-width fill of our square. */}
      <div
        className="h-full w-full [&>aside]:!w-full [&>aside]:!border-0 [&>aside]:!bg-transparent"
        style={{ display: collapsed ? "none" : "block" }}
        aria-hidden={collapsed}
      >
        <CitizenReports />
      </div>
    </motion.div>
  );
}
