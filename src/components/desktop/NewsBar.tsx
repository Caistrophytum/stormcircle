import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity } from "lucide-react";
import { useWarningTrends } from "@/hooks/useWarningTrends";

const ROTATE_INTERVAL_MS = 6_000;

export function NewsBar() {
  const { trends, collecting, steady } = useWarningTrends();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (trends.length === 0) return;
    setIndex(0);
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % trends.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [trends.length]);

  const current = trends[index];

  return (
    <div
      className="pointer-events-auto absolute top-3 z-20 hidden md:flex items-center justify-center overflow-hidden rounded-2xl px-4 py-2"
      style={{
        left: "calc(0.75rem + ((100vw - 56px) / 3))",
        right: "calc(0.75rem + ((100vw - 56px) / 3))",
        background: "rgba(18,18,22,0.72)",
        backdropFilter: "blur(24px)",
        border: "1px solid rgba(255,157,0,0.35)",
        boxShadow: "0 0 32px rgba(255,157,0,0.2), 0 20px 40px rgba(0,0,0,0.5)",
      }}
    >
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-primary" />
        <AnimatePresence mode="wait">
          {collecting || trends.length === 0 ? (
            <motion.span
              key={steady ? "steady" : "collecting"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="font-mono text-[11px] font-bold uppercase tracking-wider text-white/70"
            >
              {collecting ? "Building warning trends..." : "Warning trends steady"}
            </motion.span>
          ) : (
            <motion.span
              key={current.event}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="font-mono text-[11px] font-bold uppercase tracking-wider"
              style={{ color: current.color }}
            >
              {current.event} is {current.label}. ({current.percent > 0 ? "+" : ""}
              {current.percent}%)
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
