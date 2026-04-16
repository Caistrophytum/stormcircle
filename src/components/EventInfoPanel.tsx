const topHazards = [
  { hazard: "THUNDERSTORM", alerts: 247 },
  { hazard: "FLOOD", alerts: 183 },
  { hazard: "WIND", alerts: 156 },
  { hazard: "TORNADO", alerts: 89 },
  { hazard: "HAIL", alerts: 74 },
];

const dangerousAlerts = [
  { alert: "EF4 TORNADO — Oklahoma", severity: "EMERGENCY" as const },
  { alert: "FLASH FLOOD — Houston", severity: "WARNING" as const },
  { alert: "DERECHO — Illinois", severity: "WARNING" as const },
];

const severityColors: Record<string, string> = {
  EMERGENCY: "bg-[hsl(var(--severity-emergency))]",
  WARNING: "bg-[hsl(var(--severity-warning))]",
  WATCH: "bg-[hsl(var(--severity-watch))]",
};

const EventInfoPanel = () => {
  return (
    <div className="flex gap-2 transition-all duration-300 ease-in-out w-fit">
      {/* Top 5 Hazards */}
      <div className="glass-panel p-2.5 whitespace-nowrap">
        <h3 className="text-[9px] font-mono text-primary tracking-[0.2em] uppercase mb-2">
          Top 5 Hazards
        </h3>
        <div className="flex flex-col gap-1">
          {topHazards.map((h, i) => (
            <div key={h.hazard} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono text-muted-foreground w-3">
                  {i + 1}.
                </span>
                <span className="text-[10px] font-mono text-card-foreground tracking-wider">
                  {h.hazard}
                </span>
              </div>
              <span className="text-[10px] font-mono text-primary tabular-nums">
                {h.alerts}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top 3 Most Dangerous */}
      <div className="glass-panel p-2.5 whitespace-nowrap">
        <h3 className="text-[9px] font-mono text-primary tracking-[0.2em] uppercase mb-2">
          Most Dangerous
        </h3>
        <div className="flex flex-col gap-1.5">
          {dangerousAlerts.map((a, i) => (
            <div key={a.alert} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono text-muted-foreground w-3">
                  {i + 1}.
                </span>
                <span className="text-[10px] font-mono text-card-foreground leading-tight">
                  {a.alert}
                </span>
              </div>
              <div className="ml-[18px]">
                <span
                  className={`text-[8px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm ${severityColors[a.severity]} text-background font-bold`}
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
