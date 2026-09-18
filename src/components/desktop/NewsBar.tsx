import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWarningTrends } from "@/hooks/useWarningTrends";

const ROTATE_INTERVAL_MS = 6_000;
const MARQUEE_SPEED_PX_S = 60;
const MARQUEE_MIN_DURATION_S = 12;

// Thick, cartoony-but-serious outline: eight directional hits plus a soft glow.
function buildOutline(color: string) {
  const px = "1.3px";
  return [
    `-${px} 0 0 ${color}`,
    `${px} 0 0 ${color}`,
    `0 -${px} 0 ${color}`,
    `0 ${px} 0 ${color}`,
    `-${px} -${px} 0 ${color}`,
    `${px} -${px} 0 ${color}`,
    `-${px} ${px} 0 ${color}`,
    `${px} ${px} 0 ${color}`,
    `0 0 5px ${color}`,
  ].join(", ");
}

// Click cycles ticker speed: normal -> slow (0.5x) -> fast (2x) -> normal.
const SPEED_MULTIPLIERS = [1, 0.5, 2];

export function NewsBar() {
  const { trends, collecting, steady } = useWarningTrends();
  const [index, setIndex] = useState(0);
  const [tickerRun, setTickerRun] = useState(0);
  const [speedMode, setSpeedMode] = useState(0);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [contentNode, setContentNode] = useState<HTMLSpanElement | null>(null);
  const current = trends[index];

  // Preserves scroll position across speed changes (same headline only).
  const animRef = useRef<Animation | null>(null);
  const animDurationRef = useRef(0);
  const resumeRef = useRef<{ key: string; ratio: number } | null>(null);


  useEffect(() => {
    if (trends.length === 0) return;
    setIndex(0);
  }, [trends.length]);

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % Math.max(trends.length, 1));
    setTickerRun((run) => run + 1);
  }, [trends.length]);

  // Drive the marquee directly so data refreshes and rerenders cannot
  // reset a headline midway through its trip across the ticker.
  useLayoutEffect(() => {
    let animation: Animation | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const runKey = `${current?.event}-${index}-${tickerRun}`;

    const start = () => {
      const zone = zoneRef.current;
      const content = contentNode;
      if (!zone || !content || collecting || trends.length === 0) {
        return;
      }

      animation?.cancel();
      if (timer) clearTimeout(timer);

      const zoneWidth = zone.clientWidth;
      const contentWidth = content.scrollWidth;
      if (contentWidth + 24 <= zoneWidth) {
        content.style.transform = "translateX(0px)";
        if (trends.length > 1) timer = setTimeout(advance, ROTATE_INTERVAL_MS);
        return;
      }

      const startX = zoneWidth + 8;
      const endX = -(contentWidth + 16);
      const speedMult = SPEED_MULTIPLIERS[speedMode];
      const duration = Math.max(
        ((startX - endX) / (MARQUEE_SPEED_PX_S * speedMult)) * 1000,
        MARQUEE_MIN_DURATION_S * 1000,
      );
      animation = content.animate(
        [
          { transform: `translateX(${startX}px)` },
          { transform: `translateX(${endX}px)` },
        ],
        { duration, easing: "linear", fill: "forwards" },
      );
      // Resume where the previous run of this same headline left off, so a
      // speed change never restarts the headline from the beginning.
      const preserved =
        progressKeyRef.current === runKey ? progressRatioRef.current : 0;
      progressKeyRef.current = runKey;
      if (preserved > 0) {
        animation.currentTime = Math.min(preserved, 0.999) * duration;
      }
      animRef.current = animation;
      animDurationRef.current = duration;
      animation.onfinish = () => {
        if (!cancelled) advance();
      };
    };

    const frame = requestAnimationFrame(start);

    void document.fonts?.ready.then(() => {
      if (!cancelled) start();
    });
    window.addEventListener("resize", start);
    return () => {
      cancelled = true;
      // Snapshot progress so a speed change can resume mid-headline.
      const running = animRef.current;
      if (running && progressKeyRef.current === runKey && animDurationRef.current > 0) {
        const t = typeof running.currentTime === "number" ? running.currentTime : 0;
        progressRatioRef.current = Math.min(t / animDurationRef.current, 1);
      }
      cancelAnimationFrame(frame);
      animation?.cancel();
      if (timer) clearTimeout(timer);
      window.removeEventListener("resize", start);
    };
  }, [index, tickerRun, speedMode, trends.length, collecting, current?.event, contentNode, advance]);

  return (
    <div
      className="pointer-events-auto absolute top-3 z-20 hidden md:flex items-stretch h-11 overflow-hidden rounded-lg cursor-pointer select-none"
      onClick={() => setSpeedMode((m) => (m + 1) % SPEED_MULTIPLIERS.length)}
      title="Click to change ticker speed"
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

      {/* Ticker zone */}
      <div ref={zoneRef} className="flex-1 h-full relative flex items-center overflow-hidden">
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
              style={{
                textShadow: buildOutline("rgba(255,157,0,0.45)"),
              }}
            >
              {collecting ? "Building warning trends..." : "Warning trends steady"}
            </motion.span>
          ) : (
            <motion.div
              key={`${current.event}-${index}-${tickerRun}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex items-center overflow-hidden"
            >
              <span
                ref={setContentNode}
                className="inline-flex items-center gap-3 whitespace-nowrap pl-4"
              >
                <span
                  className="font-mono text-xs font-bold uppercase tracking-wider text-white"
                  style={{
                    textShadow: buildOutline(current.color),
                  }}
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

      {/* Right accent */}
      <div className="flex items-center h-full pl-3 pr-4 shrink-0 z-10">
        <span className="w-px h-5" style={{ background: "rgba(255,157,0,0.6)" }} />
        <span className="w-px h-3 ml-2" style={{ background: "rgba(255,157,0,0.4)" }} />
      </div>

      {/* Inset vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: "inset 0 0 40px rgba(0,0,0,0.8)" }}
      />
    </div>
  );
}
