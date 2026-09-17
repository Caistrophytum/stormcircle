import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWarningTrends } from "@/hooks/useWarningTrends";

const ROTATE_INTERVAL_MS = 6_000;
const MARQUEE_SPEED_PX_S = 55;

function useUtcClock() {
  const [time, setTime] = useState(() => formatUtc());
  useEffect(() => {
    const id = setInterval(() => setTime(formatUtc()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function formatUtc(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function NewsBar() {
  const { trends, collecting, steady } = useWarningTrends();
  const [index, setIndex] = useState(0);
  const clock = useUtcClock();
  const zoneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [marquee, setMarquee] = useState<{
    start: number;
    end: number;
    duration: number;
  } | null>(null);

  useEffect(() => {
    if (trends.length === 0) return;
    setIndex(0);
  }, [trends.length]);

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % Math.max(trends.length, 1));
  }, [trends.length]);

  // When a headline fits without scrolling, rotate on a timer instead.
  useEffect(() => {
    if (marquee || trends.length <= 1) return;
    const id = setInterval(advance, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [marquee, trends.length, advance]);

  // Measure each headline: scroll it fully through the bar when it overflows,
  // center it statically when it fits.
  useLayoutEffect(() => {
    const zone = zoneRef.current;
    const content = contentRef.current;
    if (!zone || !content || collecting || trends.length === 0) {
      setMarquee(null);
      return;
    }
    const zoneWidth = zone.clientWidth;
    const contentWidth = content.scrollWidth;
    if (contentWidth + 24 <= zoneWidth) {
      setMarquee(null);
      return;
    }
    const start = zoneWidth + 8;
    const end = -(contentWidth + 16);
    const duration = Math.max((start - end) / MARQUEE_SPEED_PX_S, 6);
    setMarquee({ start, end, duration });
  }, [index, trends, collecting, steady]);

  const current = trends[index];

  return (
    <div
      className="pointer-events-auto absolute top-3 z-20 hidden md:flex items-stretch h-11 overflow-hidden rounded-lg"
      style={{
        left: "calc(1.25rem + ((100vw - 56px) / 3))",
        right: "calc(1.25rem + ((100vw - 56px) / 3))",
        background: "rgba(10,10,12,0.92)",
        borderTop: "1px solid rgba(255,157,0,0.22)",
        borderBottom: "1px solid rgba(255,157,0,0.22)",
        boxShadow:
          "inset 0 0 24px rgba(255,157,0,0.05), 0 12px 32px rgba(0,0,0,0.55)",
      }}
    >
      {/* Masthead */}
      <div
        className="flex items-center h-full px-4 shrink-0 z-10"
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRight: "1px solid rgba(255,157,0,0.22)",
        }}
      >
        <span className="font-mono text-sm font-extrabold italic tracking-tighter leading-none text-primary">
          STORMCIRCLE
        </span>
      </div>

      {/* Live trends badge */}
      <div className="flex items-center px-3 shrink-0 z-10">
        <div
          className="flex items-center gap-2 px-2 py-0.5 rounded-sm"
          style={{
            background: "rgba(255,157,0,0.1)",
            border: "1px solid rgba(255,157,0,0.3)",
          }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ background: "#ff9d00" }}
            />
            <span
              className="relative inline-flex rounded-full h-1.5 w-1.5"
              style={{ background: "#ff9d00" }}
            />
          </span>
          <span className="font-mono text-[10px] font-black uppercase tracking-widest text-primary">
            Live Trends
          </span>
        </div>
      </div>

      {/* Ticker zone */}
      <div className="flex-1 h-full relative flex items-center overflow-hidden">
        {/* Decorative sweep line */}
        <div
          className="absolute inset-0 pointer-events-none opacity-5"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, #ff9d00 50%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
        />

        <AnimatePresence mode="wait">
          {collecting || trends.length === 0 ? (
            <motion.span
              key={steady ? "steady" : "collecting"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="pl-4 font-mono text-xs font-bold uppercase tracking-wider text-white/50 whitespace-nowrap"
            >
              {collecting ? "Building warning trends..." : "Warning trends steady"}
            </motion.span>
          ) : (
            <motion.div
              key={current.event}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex items-center overflow-hidden"
            >
              <span className="newsbar-ticker pl-4">
                <span
                  className="font-mono text-xs font-bold uppercase tracking-wider"
                  style={{ color: current.color }}
                >
                  {current.event} is {current.label}.
                </span>
                <span
                  className="font-mono text-[11px] font-black rounded-sm px-1.5 py-0.5 tracking-tight"
                  style={{ background: current.color, color: "#050505" }}
                >
                  {current.percent > 0 ? "+" : ""}
                  {current.percent}%
                </span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ticker fade edges */}
        <div
          className="absolute inset-y-0 right-0 w-10 pointer-events-none"
          style={{
            background: "linear-gradient(to left, rgba(10,10,12,0.95), transparent)",
          }}
        />
        <div
          className="absolute inset-y-0 left-0 w-6 pointer-events-none"
          style={{
            background: "linear-gradient(to right, rgba(10,10,12,0.95), transparent)",
          }}
        />
      </div>

      {/* Clock + right HUD accents */}
      <div className="flex items-center h-full pl-3 pr-4 shrink-0 z-10 gap-3">
        <span className="font-mono text-[11px] font-bold tabular-nums whitespace-nowrap text-white/40">
          {clock}Z
        </span>
        <span className="w-px h-5" style={{ background: "rgba(255,157,0,0.6)" }} />
        <span className="w-px h-3" style={{ background: "rgba(255,157,0,0.4)" }} />
      </div>

      {/* Inset vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: "inset 0 0 40px rgba(0,0,0,0.8)" }}
      />
    </div>
  );
}
