/**
 * ExerciseComfort — modal panel that scores outdoor activity comfort for the
 * user's home city over the next 6 hours. Reachable from a top-center button
 * on desktop and a bottom-nav icon on mobile.
 *
 * Score model lives in `@/lib/exerciseComfort`. This component only wires
 * data sources together:
 *   • Home city coords via `useHomeCityRisk` (already used elsewhere, so this
 *     component doesn't trigger a second geocode).
 *   • 6-hour weather + AQ via `useExerciseComfortData`.
 *   • Active alerts that CONTAIN the home point via `useWarningPolygons`
 *     (deduped by event, mirroring `CurrentLocationHazards`).
 *   • SPC categorical, SPC fire outlook, and WRS threat via existing hooks.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Bike, ChevronDown, Footprints, Mountain, PersonStanding, X } from "lucide-react";

import FloatingWindow from "@/components/desktop/FloatingWindow";
import { useAuth } from "@/hooks/useAuth";
import { useMobile } from "@/hooks/useMobile";
import { useHomeCityRisk } from "@/hooks/useHomeCityRisk";
import { useHomeCityFireRisk } from "@/hooks/useHomeCityFireRisk";
import { useWarningPolygons } from "@/hooks/useWarningPolygons";
import { pointInPolygon } from "@/lib/pointInPolygon";
import { useExerciseComfortData } from "@/hooks/useExerciseComfortData";
import {
  computeAllActivities,
  describeWarningRestrictions,
  type Activity,
  type ActivityResult,
  type ComfortTier,
} from "@/lib/exerciseComfort";

interface Props {
  open: boolean;
  onClose: () => void;
  /** WRS threat number (0–100) from the caller. Optional; defaults to 0. */
  wrs?: number;
}

const TIER_COLOR: Record<ComfortTier, string> = {
  Ideal: "#00ff88",
  Good: "#a3e635",
  Fair: "#facc15",
  Poor: "#fb923c",
  Dangerous: "#ff4d4d",
};

const ACTIVITY_META: Record<Activity, { label: string; Icon: typeof Bike }> = {
  walk: { label: "Walk", Icon: Footprints },
  run: { label: "Run", Icon: PersonStanding },
  bike: { label: "Bike", Icon: Bike },
  hike: { label: "Hike", Icon: Mountain },
};

// Palette for the single-line contribution bar (mirrors the desktop WRS
// "Physical Parameters" strip).
const FACTOR_COLORS = ["#ff4d4d", "#ff9d00", "#facc15", "#00e5ff", "#00ff88", "#a78bfa", "#f472b6"];

function ScoreRow({ r }: { r: ActivityResult }) {
  const [open, setOpen] = useState(false);
  const meta = ACTIVITY_META[r.activity];
  const Icon = meta.Icon;
  const color = TIER_COLOR[r.now.tier];
  const bestColor = TIER_COLOR[r.best.tier];
  const bestTimeLabel = (() => {
    if (!r.best.time || r.best.time === r.now.time) return "now";
    // "2026-07-01T14:00" → "14:00Z"
    return r.best.time.slice(11, 16) + "Z";
  })();

  // Every hazard is shown — even at 0 points — so the additive maths is legible.
  const factors = r.now.factors;
  const totalPoints = factors.reduce((s, f) => s + f.points, 0);

  return (
    <div style={{ borderTop: "1px solid rgba(255,157,0,0.15)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto auto",
          gap: "12px",
          alignItems: "center",
          padding: "12px 14px",
          background: open ? "rgba(255,157,0,0.05)" : "transparent",
          border: "none",
          textAlign: "left",
          color: "inherit",
          font: "inherit",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            border: `1px solid ${color}66`,
            background: `${color}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            flexShrink: 0,
          }}
        >
          <Icon size={22} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.03em" }}>{meta.label.toUpperCase()}</span>
            <span style={{ fontSize: 11, color: "#a1a1aa" }}>
              best next 6 h:{" "}
              <span style={{ color: bestColor, fontWeight: 700 }}>
                {r.best.score} {r.best.tier}
              </span>{" "}
              @ {bestTimeLabel}
            </span>
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: "#d4d4d8",
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={r.now.limiter}
          >
            Limiter: <span style={{ color }}>{r.now.limiter}</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{r.now.score}</div>
          <div style={{ fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{r.now.tier}</div>
        </div>
        <ChevronDown
          size={16}
          style={{
            color: "#a1a1aa",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 200ms ease",
          }}
        />
      </button>

      {open && (
        <div style={{ padding: "0 12px 12px 12px" }}>
          <div
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#71717a",
              marginBottom: 6,
            }}
          >
            Hazard points deducted: 100 − {totalPoints.toFixed(1)} = {r.now.score}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {factors.map((f, i) => {
              const col = FACTOR_COLORS[i % FACTOR_COLORS.length];
              const fill = f.maxPoints > 0 ? (f.points / f.maxPoints) * 100 : 0;
              return (
                <div key={f.key}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 10,
                    }}
                  >
                    <span style={{ color: "#d4d4d8", textTransform: "uppercase" }}>
                      {f.label}
                      <span style={{ color: "#71717a", textTransform: "none" }}> · {f.detail}</span>
                    </span>
                    <span style={{ color: f.points > 0 ? col : "#52525b", fontWeight: 700 }}>
                      −{f.points.toFixed(1)}
                      <span style={{ color: "#71717a", fontWeight: 400 }}>
                        {" "}
                        / {f.maxPoints} max (×{f.weight})
                      </span>
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      height: 6,
                      borderRadius: 999,
                      overflow: "hidden",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      style={{
                        width: `${fill}%`,
                        height: "100%",
                        background: col,
                        boxShadow: `inset 0 0 10px ${col}, 0 0 5px ${col}`,
                        transition: "width 600ms ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8, fontSize: 9.5, color: "#71717a", lineHeight: 1.5 }}>
            {factors[0] && factors[0].points >= 1 ? (
              <>
                Biggest drag: <span style={{ color: FACTOR_COLORS[0], fontWeight: 700 }}>{factors[0].label}</span> —{" "}
                {factors[0].penalty}/100 severity × {factors[0].maxPoints} pt budget for {meta.label.toLowerCase()}.
              </>
            ) : (
              <>No meaningful hazards right now — conditions are clean.</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExerciseComfort({ open, onClose, wrs = 0 }: Props) {
  const { profile } = useAuth();
  const location = profile?.location ?? null;
  const home = useHomeCityRisk(location);
  const fire = useHomeCityFireRisk(location);
  const polygons = useWarningPolygons();
  const data = useExerciseComfortData(home.coords);

  // Dedupe warnings by event (keeping the highest severity), only those whose
  // polygon covers the home point. Works for any feed in `active_alerts` —
  // NWS products and IMS colour-tier warnings alike.
  const activeWarnings = useMemo(() => {
    if (!home.coords) return [] as { event: string; severity?: string | null }[];
    const { lat, lon } = home.coords;
    const RANK: Record<string, number> = { minor: 1, moderate: 2, severe: 3, extreme: 4 };
    const map = new Map<string, { event: string; severity?: string | null }>();
    for (const p of polygons.polygons) {
      if (!p.geometry) continue;
      if (!pointInPolygon(lon, lat, p.geometry)) continue;
      const prev = map.get(p.event);
      const rank = (s?: string | null) => (s ? (RANK[s.toLowerCase()] ?? 0) : 0);
      if (!prev || rank(p.severity) > rank(prev.severity)) {
        map.set(p.event, { event: p.event, severity: p.severity });
      }
    }
    return Array.from(map.values());
  }, [polygons.polygons, home.coords]);

  // What each active warning concretely does to the score (shown in header).
  const restrictions = useMemo(() => describeWarningRestrictions(activeWarnings), [activeWarnings]);

  const results = useMemo(() => {
    if (!data.hourly.length) return [] as ActivityResult[];
    return computeAllActivities({
      hourly: data.hourly,
      airQuality: data.airQuality,
      activeWarnings,
      spcRisk: home.risk,
      fireRisk: fire.risk,
      wrs,
    });
  }, [data.hourly, data.airQuality, activeWarnings, home.risk, fire.risk, wrs]);

  const hasLocation = !!location;
  const loading = data.loading && !data.hourly.length;
  const isMobile = useMobile();

  const subtitle = hasLocation ? `${location} — now + next 6 h` : "Set a hometown to compute local comfort";

  const body = (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", color: "#e8e8e8" }}>
      {!hasLocation && (
        <div style={{ padding: 20, fontSize: 12, color: "#d4d4d8" }}>
          Open your Account Center and set a hometown. Exercise comfort scores use your home coordinates for weather,
          air quality, and local hazard checks.
        </div>
      )}
      {hasLocation && loading && <div style={{ padding: 20, fontSize: 12, color: "#a1a1aa" }}>Loading forecast…</div>}
      {hasLocation && !loading && !results.length && (
        <div style={{ padding: 20, fontSize: 12, color: "#ff6b6b" }}>
          Couldn't load the forecast — try again in a minute.
        </div>
      )}
      {activeWarnings.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            padding: "10px 14px",
            background: "rgba(255,77,77,0.08)",
            borderBottom: "1px solid rgba(255,77,77,0.25)",
            color: "#ffb4b4",
            fontSize: 11,
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "#ff9d9d" }}>Active alerts at your location</div>
            <div style={{ marginTop: 3, color: "#ffcdcd", lineHeight: 1.45 }}>
              Alerts raise the minimum hazard level for the weather factors they cover. Even if the live reading looks
              okay, the score is pulled down to reflect the warning.
            </div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 7 }}>
              {restrictions.map((r) => (
                <div key={r.event}>
                  <div style={{ color: "#ffd0d0", fontWeight: 600 }}>
                    {r.event}
                    <span style={{ color: "#ff8a8a", fontWeight: 400 }}> · {r.severityLabel}</span>
                  </div>
                  <ul style={{ margin: "3px 0 0", paddingLeft: 14, color: "#ffb4b4", fontSize: 10, lineHeight: 1.4 }}>
                    {r.effects.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {results.map((r) => (
        <ScoreRow key={r.activity} r={r} />
      ))}
      <div
        style={{
          padding: "8px 14px",
          borderTop: "1px solid rgba(255,157,0,0.18)",
          fontSize: 9.5,
          color: "#71717a",
          lineHeight: 1.5,
        }}
      >
        Score = 100 − the sum of hazard points (Ideal ≥ 80, Good ≥ 60, Fair ≥ 40, Poor ≥ 20, Dangerous &lt; 20).
        Budgets: real-feel temperature 100, wind 100 (0–110 km/h), rain 80 (0–20 mm/h), US AQI 100, UV 60 (0–11) — each
        scaled by an activity multiplier. Active alerts raise their hazard's severity floor; life-safety alerts cap the
        score.
      </div>
    </div>
  );

  // Mobile: render inline full-width inside the MobileScreen shell — the
  // desktop FloatingWindow anchors to #desktop-dock which doesn't exist on
  // mobile, so its geometry would collapse to a thin column.
  if (isMobile) {
    if (!open) return null;
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          background: "rgba(10,10,14,0.96)",
          color: "#e8e8e8",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid rgba(255,157,0,0.25)" }}
        >
          <div className="min-w-0">
            <div className="truncate text-xs font-bold uppercase tracking-widest" style={{ color: "rgb(255,157,0)" }}>
              Exercise Comfort
            </div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{subtitle}</div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{
              border: "1px solid rgba(255,157,0,0.35)",
              color: "rgb(255,157,0)",
              background: "rgba(0,0,0,0.4)",
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>{body}</div>
      </div>
    );
  }

  return (
    <FloatingWindow open={open} onClose={onClose} title="Exercise Comfort" subtitle={subtitle} accent="255,157,0">
      {body}
    </FloatingWindow>
  );
}
