import { useEffect, useState } from "react";

const StatusBar = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const zulu = time.toISOString().slice(11, 19);

  return (
    <header className="h-14 border-b border-border bg-cockpit/80 backdrop-blur-md flex items-center justify-between px-6 z-20 shrink-0">
      <div className="flex items-center gap-8">
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-muted-foreground uppercase leading-none">
            Coordinate
          </span>
          <span className="text-sm font-mono text-card-foreground">
            34.0522° N, 118.2437° W
          </span>
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-muted-foreground uppercase leading-none">
            Pressure
          </span>
          <span className="text-sm font-mono text-neon-blue">1013.2 hPa</span>
        </div>
      </div>

      {/* Active Alert */}
      <div className="flex items-center gap-4 bg-destructive/5 border border-destructive/20 px-4 py-1.5 rounded">
        <div className="size-2 bg-destructive rounded-full animate-pulse" />
        <span className="text-xs font-mono font-bold text-destructive uppercase tracking-tighter">
          Alert: Severe Supercell Formative - Sector 7G
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <span className="block text-[10px] font-mono text-muted-foreground leading-none">
            Mission Time
          </span>
          <span className="text-sm font-mono text-card-foreground">{zulu} ZULU</span>
        </div>
      </div>
    </header>
  );
};

export default StatusBar;
