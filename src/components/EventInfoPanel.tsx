interface HazardData {
  hazard: string;
  alerts: number;
}

interface DangerousAlert {
  alert: string;
  severity: "EMERGENCY" | "WARNING" | "WATCH";
}

const severityColors: Record<string, string> = {
  EMERGENCY: "bg-[hsl(var(--severity-emergency))]",
  WARNING: "bg-[hsl(var(--severity-warning))]",
  WATCH: "bg-[hsl(var(--severity-watch))]",
};

interface Props {
  topHazards: HazardData[];
  dangerousAlerts: DangerousAlert[];
}

const EventInfoPanel = ({ topHazards, dangerousAlerts }: Props) => {
  return (
    <div className="flex gap-2 transition-all duration-300 ease-in-out w-fit">
      {/* Top 5 Hazards */}
      <div className="glass-panel p-2.5 whitespace-nowrap">
        <h3 className="text-[15px] font-mono text-primary tracking-[0.2em] uppercase mb-2">
          Top 5 Hazards
        </h3>
        <div className="flex flex-col gap-1" />
      </div>

      {/* Top 3 Most Dangerous */}
      <div className="glass-panel p-2.5 whitespace-nowrap">
        <h3 className="text-[15px] font-mono text-primary tracking-[0.2em] uppercase mb-2">
          Most Dangerous
        </h3>
        <div className="flex flex-col gap-1.5" />
      </div>
    </div>
  );
};

export default EventInfoPanel;
