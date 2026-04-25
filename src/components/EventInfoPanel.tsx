import { useEffect, useState } from "react";
import { useAlerts, type AlertKind, type Severity } from "@/hooks/useAlerts";

const severityBadge: Record<Severity, string> = {
  Extreme: "bg-red-600 text-white",
  Severe: "bg-orange-500 text-white",
  Moderate: "bg-yellow-400 text-black",
  Minor: "bg-blue-500 text-white",
  Unknown: "bg-muted text-muted-foreground",
};

const kindBadge: Record<AlertKind, string> = {
  Emergency: "bg-red-700 text-white",
  Warning: "bg-orange-600 text-white",
  Watch: "bg-yellow-500 text-black",
  Advisory: "bg-blue-600 text-white",
  Statement: "bg-slate-500 text-white",
  Other: "bg-muted text-muted-foreground",
};

const tagBadge: Record<string, string> = {
  PDS: "bg-fuchsia-700 text-white",
  "Tornado Emergency": "bg-red-800 text-white",
  "Flash Flood Emergency": "bg-red-800 text-white",
  Catastrophic: "bg-red-700 text-white",
  Destructive: "bg-orange-700 text-white",
  Considerable: "bg-amber-600 text-white",
};

function formatRelativeTime(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} d ago`;
}

interface EventInfoPanelProps {
  /** When true, the two cards stack vertically instead of side-by-side. */
  stacked?: boolean;
  /** Which card(s) to render. Defaults to "both". */
  show?: "both" | "hazards" | "dangerous";
}

/* ------- Fluid sizing tokens (single source of truth) -------
 * Heights, fonts, paddings and gaps all use clamp() against dvh/dvw so
 * the entire panel system compresses proportionally as vertical space
 * shrinks, then re-expands when room is available. min-h-0/min-w-0 are
 * applied to every flex child so the clamps actually win against
 * intrinsic content sizes.
 */
const PANEL_PAD = "clamp(4px, 0.8dvh, 12px) clamp(6px, 0.8dvw, 12px)";
const STACK_GAP = "clamp(4px, 0.8dvh, 12px)";
const ITEM_GAP = "clamp(2px, 0.5dvh, 8px)";
const HEADER_FS = "clamp(8px, 0.9dvh, 11px)";
const BODY_FS = "clamp(10px, 1.1dvh, 13px)";
const META_FS = "clamp(8px, 0.8dvh, 10px)";
const BADGE_FS = "clamp(9px, 0.9dvh, 11px)";

const HAZARDS_H = "clamp(100px, 14dvh, 220px)";
const NEW_H = "clamp(100px, 14dvh, 220px)";
const DANGEROUS_H = "clamp(120px, 18dvh, 280px)";

const EventInfoPanel = ({ stacked = false, show = "both" }: EventInfoPanelProps) => {
  const { mostDangerous, topHazards, newWarnings, loading, error, lastUpdated } = useAlerts();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={`flex items-start transition-all duration-300 ease-in-out w-fit min-h-0 min-w-0 ${
        stacked ? "flex-col" : "flex-row"
      }`}
      style={{ gap: STACK_GAP }}
    >
      {show !== "dangerous" && (
        <div
          className="flex flex-col self-start min-h-0 min-w-0"
          style={{ gap: STACK_GAP }}
        >
          {/* Top 5 Hazards */}
          <div
            className="glass-panel whitespace-nowrap min-w-[220px] flex flex-col min-h-0 overflow-hidden"
            style={{ padding: PANEL_PAD, height: HAZARDS_H }}
          >
            <h3
              className="font-mono text-primary tracking-[0.2em] uppercase shrink-0"
              style={{ fontSize: HEADER_FS, marginBottom: ITEM_GAP }}
            >
              Top 5 Hazards
            </h3>
            <div
              className="flex flex-col flex-1 min-h-0 overflow-y-auto no-scrollbar"
              style={{ gap: ITEM_GAP }}
            >
              {loading && (
                <span className="font-mono text-muted-foreground" style={{ fontSize: BODY_FS }}>Loading…</span>
              )}
              {error && !loading && (
                <span className="font-mono text-destructive" style={{ fontSize: BODY_FS }}>Error: {error}</span>
              )}
              {!loading && !error && topHazards.length === 0 && (
                <span className="font-mono text-muted-foreground" style={{ fontSize: BODY_FS }}>No active hazards</span>
              )}
              {topHazards.map((h, i) => (
                <div key={h.event} className="flex items-center justify-between gap-4 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-muted-foreground w-4 shrink-0" style={{ fontSize: BODY_FS }}>
                      {i + 1}.
                    </span>
                    <span className="font-mono text-card-foreground tracking-wider truncate" style={{ fontSize: BODY_FS }}>
                      {h.event}
                    </span>
                  </div>
                  <span
                    className="font-mono text-primary tabular-nums px-1.5 py-0.5 rounded-sm bg-primary/15 border border-primary/30 shrink-0"
                    style={{ fontSize: BADGE_FS }}
                  >
                    {h.count} active
                  </span>
                </div>
              ))}
            </div>
            {lastUpdated && (
              <div
                className="mt-1 pt-1 border-t border-border/40 font-mono text-muted-foreground tracking-wider shrink-0"
                style={{ fontSize: META_FS }}
              >
                Last updated {formatRelativeTime(lastUpdated, now)}
              </div>
            )}
          </div>

          {/* New Warnings (last 5 refreshes) */}
          <div
            className="glass-panel whitespace-nowrap min-w-[220px] flex flex-col min-h-0 overflow-hidden"
            style={{ padding: PANEL_PAD, height: NEW_H }}
          >
            <h3
              className="font-mono text-primary tracking-[0.2em] uppercase shrink-0"
              style={{ fontSize: HEADER_FS, marginBottom: ITEM_GAP }}
            >
              New Warnings
            </h3>
            <div
              className="flex flex-col flex-1 min-h-0 overflow-y-auto no-scrollbar"
              style={{ gap: ITEM_GAP }}
            >
              {loading && (
                <span className="font-mono text-muted-foreground" style={{ fontSize: BODY_FS }}>Loading…</span>
              )}
              {!loading && !error && newWarnings.length === 0 && (
                <span className="font-mono text-muted-foreground" style={{ fontSize: BODY_FS }}>No new warnings</span>
              )}
              {newWarnings.map((h, i) => (
                <div key={h.event} className="flex items-center justify-between gap-4 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-muted-foreground w-4 shrink-0" style={{ fontSize: BODY_FS }}>
                      {i + 1}.
                    </span>
                    <span className="font-mono text-card-foreground tracking-wider truncate" style={{ fontSize: BODY_FS }}>
                      {h.event}
                    </span>
                  </div>
                  <span
                    className="font-mono tabular-nums px-1.5 py-0.5 rounded-sm bg-destructive/15 border border-destructive/40 text-destructive shrink-0"
                    style={{ fontSize: BADGE_FS }}
                  >
                    {h.count} New
                  </span>
                </div>
              ))}
            </div>
            <div
              className="mt-1 pt-1 border-t border-border/40 font-mono text-muted-foreground tracking-wider shrink-0"
              style={{ fontSize: META_FS }}
            >
              Last 5 refresh cycles
            </div>
          </div>
        </div>
      )}

      {show !== "hazards" && (
        <div
          className="glass-panel whitespace-nowrap min-w-[260px] flex flex-col min-h-0 overflow-hidden"
          style={{ padding: PANEL_PAD, height: DANGEROUS_H }}
        >
          <h3
            className="font-mono text-primary tracking-[0.2em] uppercase shrink-0"
            style={{ fontSize: HEADER_FS, marginBottom: ITEM_GAP }}
          >
            Top 6 Most Dangerous
          </h3>
          <div
            className="flex flex-col flex-1 min-h-0 overflow-y-auto no-scrollbar"
            style={{ gap: ITEM_GAP }}
          >
            {loading && (
              <span className="font-mono text-muted-foreground" style={{ fontSize: BODY_FS }}>Loading…</span>
            )}
            {error && !loading && (
              <span className="font-mono text-destructive" style={{ fontSize: BODY_FS }}>Error: {error}</span>
            )}
            {!loading && !error && mostDangerous.length === 0 && (
              <span className="font-mono text-muted-foreground" style={{ fontSize: BODY_FS }}>No active alerts</span>
            )}
            {mostDangerous.map((a, i) => (
              <div key={`${a.event}-${i}`} className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono text-muted-foreground w-4 shrink-0" style={{ fontSize: BODY_FS }}>
                    {i + 1}.
                  </span>
                  <span className="font-mono font-bold text-card-foreground leading-tight truncate" style={{ fontSize: BODY_FS }}>
                    {a.event}
                  </span>
                </div>
                <div
                  className="ml-[22px] font-mono text-muted-foreground leading-tight max-w-[260px] truncate"
                  style={{ fontSize: META_FS }}
                >
                  {a.areaDesc}
                </div>
                <div className="ml-[22px] flex flex-wrap items-center gap-1">
                  <span
                    className={`font-mono tracking-widest px-1.5 py-0.5 rounded-sm font-bold uppercase ${severityBadge[a.severity]}`}
                    style={{ fontSize: BADGE_FS }}
                  >
                    {a.severity}
                  </span>
                  {a.kind !== "Other" && (
                    <span
                      className={`font-mono tracking-widest px-1.5 py-0.5 rounded-sm font-bold uppercase ${kindBadge[a.kind]}`}
                      style={{ fontSize: BADGE_FS }}
                    >
                      {a.kind}
                    </span>
                  )}
                  {a.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`font-mono tracking-widest px-1.5 py-0.5 rounded-sm font-bold uppercase ${
                        tagBadge[tag] ?? "bg-muted text-muted-foreground"
                      }`}
                      style={{ fontSize: BADGE_FS }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventInfoPanel;
