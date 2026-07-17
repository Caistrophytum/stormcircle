/**
 * MetricsTab — WRS filling circle + physical parameters filling line + virtual
 * parameter cards. Colors shift gradually as values change (CSS transitions
 * on stroke / background).
 */
import { motion } from "framer-motion";
import { useWRSMetrics } from "@/hooks/useWRSMetrics";
import { useAuth } from "@/hooks/useAuth";

function wrsColor(v: number) {
  // Linear HSL interpolation green→amber→red
  const stops = [
    { at: 0, h: 142, s: 100, l: 50 },
    { at: 40, h: 60, s: 100, l: 55 },
    { at: 70, h: 28, s: 100, l: 55 },
    { at: 100, h: 0, s: 100, l: 55 },
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (v >= a.at && v <= b.at) {
      const t = (v - a.at) / (b.at - a.at);
      const h = a.h + (b.h - a.h) * t;
      const s = a.s + (b.s - a.s) * t;
      const l = a.l + (b.l - a.l) * t;
      return `hsl(${h} ${s}% ${l}%)`;
    }
  }
  return `hsl(0 100% 55%)`;
}

const PHYS_COLORS = ["hsl(190 100% 55%)", "hsl(280 90% 65%)", "hsl(36 100% 55%)"];
const VIRTUAL_COLORS = [
  "hsl(0 100% 60%)",
  "hsl(28 100% 55%)",
  "hsl(48 100% 55%)",
  "hsl(190 100% 55%)",
  "hsl(280 90% 65%)",
];

export default function MetricsTab() {
  const { threatLevel, physicalNodes, soundingNodes, stationActive } = useWRSMetrics();
  const { profile } = useAuth();
  const cityName = profile?.location ?? null;
  const size = 140;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (threatLevel / 100) * c;
  const color = wrsColor(threatLevel);

  // Physical: single line, each param a segment sized by wrsContribution %.
  const physTotal = physicalNodes.reduce((s, n) => s + n.wrsContribution, 0);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div
        className="font-mono text-[11px] font-bold uppercase tracking-widest"
        style={{ color, textShadow: `0 0 8px ${color}`, transition: "color 800ms ease" }}
      >
        In {cityName ?? "your area"}
      </div>
      {/* WRS circle + physical line */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: size, height: size, overflow: "visible" }}>
          <svg width={size} height={size} className="-rotate-90" style={{ overflow: "visible" }}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={stroke}
              fill="none"
            />
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
              transition={{ duration: 0.9, ease: "easeOut" }}
              style={{
                filter: `drop-shadow(0 0 8px ${color})`,
                transition: "stroke 800ms ease",
              }}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="font-mono text-3xl font-bold tabular-nums"
              style={{ color, transition: "color 800ms ease", textShadow: `0 0 8px ${color}` }}
            >
              {threatLevel}
            </span>
            <span className="mt-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              WRS
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
            Physical Parameters
          </div>
          <div className="flex flex-1 items-end gap-2">
            {physicalNodes.map((p, i) => {
              const col = PHYS_COLORS[i % PHYS_COLORS.length];
              const pct = Math.max(0, Math.min(100, p.wrsContribution));
              return (
                <div key={p.label} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="relative flex w-full flex-col justify-end overflow-hidden rounded-md"
                    style={{
                      height: 72,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                    title={`${p.label}: ${p.wrsContribution}%`}
                  >
                    <motion.div
                      initial={false}
                      animate={{ height: `${pct}%` }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                      style={{
                        background: col,
                        boxShadow: `inset 0 0 12px ${col}, 0 0 6px ${col}`,
                      }}
                    />
                  </div>
                  <div className="flex flex-col items-center leading-tight">
                    <span className="text-[9px] font-mono uppercase text-muted-foreground">
                      {p.label}
                    </span>
                    <span
                      className="text-[10px] font-mono font-bold tabular-nums"
                      style={{ color: p.colorHsl, transition: "color 500ms ease" }}
                    >
                      {p.value}
                      <span className="ml-0.5 text-[8px] text-muted-foreground">{p.unit}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Virtual parameters — rounded boxes */}
      <div>
        <div className="mb-2 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
          Virtual Parameters
        </div>
        <div className="grid grid-cols-5 gap-2">
          {soundingNodes.map((n, i) => {
            const accent = VIRTUAL_COLORS[i % VIRTUAL_COLORS.length];
            return (
              <div
                key={n.label}
                className="relative flex flex-col gap-1 rounded-xl p-2"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${accent}55`,
                  boxShadow: `inset 0 0 12px ${accent}18, 0 0 8px ${accent}22`,
                  transition: "border-color 500ms ease, box-shadow 500ms ease",
                }}
              >
                <div className="text-[8px] font-mono uppercase leading-none text-muted-foreground">
                  {n.label}
                </div>
                <div
                  className="font-mono text-sm font-bold leading-tight tabular-nums"
                  style={{ color: n.colorHsl, transition: "color 500ms ease" }}
                >
                  {n.value}
                  <span className="ml-0.5 text-[8px] text-muted-foreground">{n.unit}</span>
                </div>
                <div
                  className="text-[9px] font-mono font-bold leading-none"
                  style={{ color: accent }}
                >
                  {n.wrsContribution}%
                </div>
              </div>
            );
          })}
        </div>
        {!stationActive && (
          <p className="mt-2 text-center text-[10px] font-mono italic text-muted-foreground">
            Pick a radar station on the map to enable metrics.
          </p>
        )}
      </div>
    </div>
  );
}
