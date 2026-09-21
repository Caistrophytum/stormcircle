import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useWarningTrends, type TrendRegion } from "@/hooks/useWarningTrends";

const ROTATE_INTERVAL_MS = 6_000;
const MARQUEE_SPEED_PX_S = 60;
const MARQUEE_MIN_DURATION_S = 12;

const SPEED_OPTIONS = [0.5, 1, 2];
const REGION_OPTIONS: { value: TrendRegion; label: string; tag: string }[] = [
  { value: "all", label: "All Trends", tag: "ALL" },
  { value: "US", label: "US Trends", tag: "US" },
  { value: "EU", label: "EU Trends", tag: "EU" },
];

const LS_SPEED = "sc.newsbar.speed";
const LS_REGION = "sc.newsbar.region";
const LS_UPDATED = "sc.newsbar.lastUpdated";

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

function readStoredSpeed() {
  const raw = Number(localStorage.getItem(LS_SPEED));
  return SPEED_OPTIONS.includes(raw) ? raw : 1;
}

function readStoredRegion(): TrendRegion {
  const raw = localStorage.getItem(LS_REGION);
  return raw === "US" || raw === "EU" || raw === "all" ? raw : "all";
}

function readStoredUpdated() {
  const raw = Number(localStorage.getItem(LS_UPDATED));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function NewsBar() {
  const [region, setRegion] = useState<TrendRegion>(readStoredRegion);
  const { trends, collecting, steady, refreshNow, refreshing, lastUpdatedAt } =
    useWarningTrends(region);
  const [index, setIndex] = useState(0);
  const [tickerRun, setTickerRun] = useState(0);
  const [speed, setSpeed] = useState(readStoredSpeed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(readStoredUpdated);
  const zoneRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [contentNode, setContentNode] = useState<HTMLSpanElement | null>(null);
  // Clamp during render: a region switch can shrink the list before the
  // index-reset effect runs, which would otherwise dereference undefined.
  const safeIndex = trends.length > 0 ? index % trends.length : 0;
  const current = trends[safeIndex];
  const activeRegion = REGION_OPTIONS.find((r) => r.value === region) ?? REGION_OPTIONS[0];

  // Preserves scroll position across speed changes (same headline only).
  const animRef = useRef<Animation | null>(null);
  const animDurationRef = useRef(0);
  const resumeRef = useRef<{ key: string; ratio: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_SPEED, String(speed));
  }, [speed]);

  useEffect(() => {
    localStorage.setItem(LS_REGION, region);
  }, [region]);

  useEffect(() => {
    if (lastUpdatedAt) {
      setUpdatedAt(lastUpdatedAt);
      localStorage.setItem(LS_UPDATED, String(lastUpdatedAt));
    }
  }, [lastUpdatedAt]);

  // Close the drop-down on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
    const runKey = `${current?.event}-${safeIndex}-${tickerRun}`;

    // Capture how far the current run of this headline has travelled, so any
    // restart (speed change, font load, resize) picks up from that point.
    const snapshot = () => {
      const running = animRef.current;
      if (!running || animDurationRef.current <= 0) return;
      const t = typeof running.currentTime === "number" ? running.currentTime : 0;
      const ratio = t / animDurationRef.current;
      if (ratio > 0 && ratio < 1) resumeRef.current = { key: runKey, ratio };
    };

    const start = () => {
      const zone = zoneRef.current;
      const content = contentNode;
      if (!zone || !content || collecting || trends.length === 0) {
        return;
      }

      snapshot();
      animation?.cancel();
      animRef.current = null;
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
      // Minimum duration scales with the speed multiplier so faster modes
      // are never clamped back toward the base pace.
      const minDuration = (MARQUEE_MIN_DURATION_S * 1000) / speed;
      const duration = Math.max(
        ((startX - endX) / (MARQUEE_SPEED_PX_S * speed)) * 1000,
        minDuration,
      );
      animation = content.animate(
        [
          { transform: `translateX(${startX}px)` },
          { transform: `translateX(${endX}px)` },
        ],
        { duration, easing: "linear", fill: "forwards" },
      );
      const resume = resumeRef.current;
      resumeRef.current = null;
      if (resume && resume.key === runKey && resume.ratio > 0 && resume.ratio < 1) {
        animation.currentTime = resume.ratio * duration;
      }
      animRef.current = animation;
      animDurationRef.current = duration;
      const finished = animation;
      finished.onfinish = () => {
        if (!cancelled && animRef.current === finished) advance();
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
      snapshot();

      cancelAnimationFrame(frame);
      animation?.cancel();
      if (timer) clearTimeout(timer);
      window.removeEventListener("resize", start);
    };
  }, [safeIndex, tickerRun, speed, trends.length, collecting, current?.event, contentNode, advance]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute top-3 z-20 hidden md:flex items-stretch h-11 rounded-lg select-none"
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
      {/* Masthead / menu trigger */}
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        title="News bar settings"
        className="flex items-center gap-2 h-full px-4 shrink-0 z-30 rounded-l-lg transition-colors hover:bg-white/10"
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRight: "1px solid rgba(255,157,0,0.22)",
        }}
      >
        <span className="font-mono text-sm font-extrabold italic tracking-tighter leading-none text-primary">
          STORMCIRCLE
        </span>
        <span
          className="font-mono text-[9px] font-bold tracking-widest text-primary/70 border border-primary/40 rounded-sm px-1 leading-none py-0.5"
        >
          {activeRegion.tag}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-primary/80 transition-transform ${menuOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Drop-down panel */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 z-40 w-60 rounded-lg p-3 space-y-3"
            style={{
              background: "rgba(10,10,12,0.97)",
              border: "1px solid rgba(255,157,0,0.25)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="space-y-1.5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                Speed
              </div>
              <div className="flex gap-1.5">
                {SPEED_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    className={`flex-1 font-mono text-[11px] font-bold rounded-sm py-1 border transition-colors ${
                      speed === s
                        ? "bg-primary text-black border-primary"
                        : "text-white/70 border-white/15 hover:border-primary/50"
                    }`}
                  >
                    x{s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                Data
              </div>
              <button
                type="button"
                onClick={() => void refreshNow()}
                disabled={refreshing}
                className="w-full flex items-center justify-center gap-1.5 font-mono text-[11px] font-bold rounded-sm py-1.5 border border-white/15 text-white/80 hover:border-primary/50 disabled:opacity-60"
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing
                  ? "Updating..."
                  : updatedAt
                    ? `Update now (last ${formatTime(updatedAt)})`
                    : "Update now"}
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                Filter
              </div>
              <div className="flex flex-col gap-1">
                {REGION_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRegion(r.value)}
                    className={`text-left font-mono text-[11px] font-bold rounded-sm px-2 py-1 border transition-colors ${
                      region === r.value
                        ? "bg-primary/20 text-primary border-primary/50"
                        : "text-white/70 border-white/10 hover:border-primary/40"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          {collecting || trends.length === 0 || !current ? (
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
              key={`${current.event}-${safeIndex}-${tickerRun}`}
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
        className="absolute inset-0 pointer-events-none rounded-lg"
        style={{ boxShadow: "inset 0 0 40px rgba(0,0,0,0.8)" }}
      />
    </div>
  );
}
