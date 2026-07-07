import { useEffect, useState } from "react";
import { useAlerts, type AlertKind, type Severity } from "@/hooks/useAlerts";
import { formatRelativeTime } from "@/lib/timeFormat";

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


interface EventInfoPanelProps {
  /** When true, the two cards stack vertically instead of side-by-side. */
  stacked?: boolean;
  /** Which card(s) to render. Defaults to "both". */
  show?: "both" | "hazards" | "dangerous" | "common" | "new";
  /** Refs for height-syncing the three panels. */
  hazardsRef?: React.Ref<HTMLDivElement>;
  newWarningsRef?: React.Ref<HTMLDivElement>;
  dangerousRef?: React.Ref<HTMLDivElement>;
  /** Inline style applied to the scrollable inner panels. */
  hazardsStyle?: React.CSSProperties;
  newWarningsStyle?: React.CSSProperties;
  dangerousStyle?: React.CSSProperties;
  /** Gap (px) between the two left/right stacked cards. */
  stackGapPx?: number;
}

const EventInfoPanel = ({
  stacked = false,
  show = "both",
  hazardsRef,
  newWarningsRef,
  dangerousRef,
  hazardsStyle,
  newWarningsStyle,
  dangerousStyle,
  stackGapPx,
}: EventInfoPanelProps) => {
  const { mostDangerous, topHazards, newWarnings, loading, error, lastUpdated } = useAlerts();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={`flex gap-2 items-start transition-all duration-300 ease-in-out w-fit ${
        stacked ? "flex-col" : "flex-row"
      }`}
    >
      {show !== "dangerous" && (
      <div
        className="flex flex-col self-start"
        style={{ gap: stackGapPx != null ? `${stackGapPx}px` : undefined }}
      >
      {/* Top 5 Hazards */}
      <div
        ref={hazardsRef}
        style={hazardsStyle}
        className="glass-panel p-2.5 whitespace-nowrap min-w-[220px]"
      >
        <h3 className="text-[15px] font-mono text-primary tracking-[0.2em] uppercase mb-2">
          Top 10 Hazards
        </h3>
        <div className="flex flex-col gap-1">
          {loading && (
            <span className="text-[13px] font-mono text-muted-foreground">Loading…</span>
          )}
          {error && !loading && (
            <span className="text-[13px] font-mono text-destructive">Error: {error}</span>
          )}
          {!loading && !error && topHazards.length === 0 && (
            <span className="text-[13px] font-mono text-muted-foreground">No active hazards</span>
          )}
          {topHazards.map((h, i) => (
            <div key={h.event} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-mono text-muted-foreground w-4">
                  {i + 1}.
                </span>
                <span className="text-[16.5px] font-mono text-card-foreground tracking-wider">
                  {h.event}
                </span>
              </div>
              <span className="text-[13px] font-mono text-primary tabular-nums px-1.5 py-0.5 rounded-sm bg-primary/15 border border-primary/30">
                {h.count} active
              </span>
            </div>
          ))}
        </div>
        {lastUpdated && (
          <div className="mt-2 pt-2 border-t border-border/40 text-[11px] font-mono text-muted-foreground tracking-wider">
            Last updated {formatRelativeTime(lastUpdated, now)}
          </div>
        )}
      </div>

      {/* New Warnings (last 5 refreshes) */}
      <div
        ref={newWarningsRef}
        style={newWarningsStyle}
        className="glass-panel p-2.5 whitespace-nowrap min-w-[220px]"
      >
        <h3 className="text-[15px] font-mono text-primary tracking-[0.2em] uppercase mb-2">
          New Warnings
        </h3>
        <div className="flex flex-col gap-1">
          {loading && (
            <span className="text-[13px] font-mono text-muted-foreground">Loading…</span>
          )}
          {!loading && !error && newWarnings.length === 0 && (
            <span className="text-[13px] font-mono text-muted-foreground">No new warnings</span>
          )}
          {newWarnings.map((h, i) => (
            <div key={h.event} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-mono text-muted-foreground w-4">
                  {i + 1}.
                </span>
                <span className="text-[16.5px] font-mono text-card-foreground tracking-wider">
                  {h.event}
                </span>
              </div>
              <span className="text-[13px] font-mono tabular-nums px-1.5 py-0.5 rounded-sm bg-destructive/15 border border-destructive/40 text-destructive">
                {h.count} New
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-border/40 text-[10px] font-mono text-muted-foreground tracking-wider">
          Last 5 refresh cycles
        </div>
      </div>
      </div>
      )}

      {show !== "hazards" && (
      <>
      {/* Top 6 Most Dangerous */}
      <div
        ref={dangerousRef}
        style={dangerousStyle}
        className="glass-panel p-2.5 whitespace-nowrap min-w-[260px]"
      >
        <h3 className="text-[15px] font-mono text-primary tracking-[0.2em] uppercase mb-2">
          Top 10 Most Dangerous
        </h3>
        <div className="flex flex-col gap-1.5">
          {loading && (
            <span className="text-[13px] font-mono text-muted-foreground">Loading…</span>
          )}
          {error && !loading && (
            <span className="text-[13px] font-mono text-destructive">Error: {error}</span>
          )}
          {!loading && !error && mostDangerous.length === 0 && (
            <span className="text-[13px] font-mono text-muted-foreground">No active alerts</span>
          )}
          {mostDangerous.map((a, i) => (
            <div key={`${a.event}-${i}`} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-mono text-muted-foreground w-4">
                  {i + 1}.
                </span>
                <span className="text-[16.5px] font-mono font-bold text-card-foreground leading-tight">
                  {a.event}
                </span>
              </div>
              <div className="ml-[22px] text-[13px] font-mono text-muted-foreground leading-tight max-w-[260px] truncate">
                {a.areaDesc}
              </div>
              <div className="ml-[22px] flex flex-wrap items-center gap-1">
                <span
                  className={`text-[12px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm font-bold uppercase ${severityBadge[a.severity]}`}
                >
                  {a.severity}
                </span>
                {a.kind !== "Other" && (
                  <span
                    className={`text-[11px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm font-bold uppercase ${kindBadge[a.kind]}`}
                  >
                    {a.kind}
                  </span>
                )}
                {a.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`text-[11px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm font-bold uppercase ${
                      tagBadge[tag] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default EventInfoPanel;
