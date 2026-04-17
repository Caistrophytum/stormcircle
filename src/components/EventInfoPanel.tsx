import { useAlerts, type Severity } from "@/hooks/useAlerts";

const severityBadge: Record<Severity, string> = {
  Extreme: "bg-red-600 text-white",
  Severe: "bg-orange-500 text-white",
  Moderate: "bg-yellow-400 text-black",
  Minor: "bg-blue-500 text-white",
  Unknown: "bg-muted text-muted-foreground",
};

const EventInfoPanel = () => {
  const { mostDangerous, topHazards, loading, error } = useAlerts();

  return (
    <div className="flex gap-2 transition-all duration-300 ease-in-out w-fit">
      {/* Top 5 Hazards */}
      <div className="glass-panel p-2.5 whitespace-nowrap min-w-[220px]">
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
              <div className="ml-[22px]">
                <span
                  className={`text-[12px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm font-bold uppercase ${severityBadge[a.severity]}`}
                >
                  {a.severity}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EventInfoPanel;
