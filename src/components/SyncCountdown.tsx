/**
 * SyncCountdown - isolated 60 second refresh countdown widgets.
 *
 * PERF: the countdown used to live as `useState` inside MobileMain (1169
 * lines) and MetricsTab, so a once-per-second setState re-rendered those
 * entire trees - roughly 86,400 full re-renders per day per open screen, for
 * a two-character label and a stroke offset.
 *
 * Each widget below owns its own interval and is memoized, so the tick now
 * re-renders only the handful of nodes that actually display it.
 */
import { memo, useEffect, useState } from "react";
import { motion } from "framer-motion";

/** Seconds remaining in the current wall-clock minute (the refresh cycle). */
function useSecondsLeft(): number {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((60_000 - (Date.now() % 60_000)) / 1000)),
  );
  useEffect(() => {
    const update = () => {
      const msIntoMinute = Date.now() % 60_000;
      setSecondsLeft(Math.max(0, Math.ceil((60_000 - msIntoMinute) / 1000)));
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);
  return secondsLeft;
}

/** Plain "Ns" label. */
export const SyncSeconds = memo(function SyncSeconds({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const secondsLeft = useSecondsLeft();
  return (
    <span className={className} style={style}>
      {secondsLeft}s
    </span>
  );
});

/** Mobile: depleting neon perimeter drawn around the WRS bar. */
export const SyncShellRect = memo(function SyncShellRect({ color }: { color: string }) {
  const secondsLeft = useSecondsLeft();
  return (
    <svg
      aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    >
      <rect
        x="1"
        y="1"
        width="calc(100% - 2px)"
        height="calc(100% - 2px)"
        rx="3"
        fill="none"
        stroke={color}
        strokeWidth="2"
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={100 - (secondsLeft / 60) * 100}
        strokeLinecap="round"
        style={{
          filter: `drop-shadow(0 0 4px ${color})`,
          transition: "stroke-dashoffset 0.35s linear",
        }}
      />
    </svg>
  );
});

/** Desktop: depleting neon ring sitting just outside the WRS circle. */
export const SyncShellCircle = memo(function SyncShellCircle({
  size,
  stroke,
  color,
}: {
  size: number;
  stroke: number;
  color: string;
}) {
  const secondsLeft = useSecondsLeft();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (secondsLeft / 60) * c;
  return (
    <svg width={size} height={size} className="absolute left-0 top-0 -rotate-90" style={{ overflow: "visible" }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={false}
        animate={{ strokeDashoffset: c - dash }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
    </svg>
  );
});
