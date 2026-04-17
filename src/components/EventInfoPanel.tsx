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

const EventInfoPanel = () => {
  const { mostDangerous, topHazards, loading, error, lastUpdated } = useAlerts();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex gap-2 items-start transition-all duration-300 ease-in-out w-fit">
      {/* Top 5 Hazards */}
      <div className="glass-panel p-2.5 whitespace-nowrap min-w-[220px] self-start">
        <h3 className="text-[15px] font-mono text-primary tracking-[0.2em] uppercase mb-2">
          Top 5 Hazards
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

      {/* Top 3 Most Dangerous */}
      <div className="glass-panel p-2.5 whitespace-nowrap min-w-[260px]">
        <h3 className="text-[15px] font-mono text-primary tracking-[0.2em] uppercase mb-2">
          Most Dangerous
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
    </div>
  );
};

export default EventInfoPanel;
