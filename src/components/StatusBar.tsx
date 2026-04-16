import { useEffect, useState } from "react";
import { LogIn, User, Shield, ChevronDown } from "lucide-react";

interface Props {
  userRole: "guest" | "citizen" | "meteorologist";
  onSignIn: () => void;
}

const StatusBar = ({ userRole, onSignIn }: Props) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const zulu = time.toISOString().slice(11, 19);

  const roleBadge = {
    guest: null,
    citizen: {
      label: "CITIZEN",
      icon: User,
      className: "bg-neon-blue/10 text-neon-blue border-neon-blue/20",
    },
    meteorologist: {
      label: "METEOROLOGIST",
      icon: Shield,
      className: "bg-primary/10 text-primary border-primary/20",
    },
  };

  const badge = roleBadge[userRole];

  return (
    <header className="h-12 border-b border-border bg-cockpit/80 backdrop-blur-md flex items-center justify-between px-4 z-20 shrink-0">
      {/* Left: role badge + coords */}
      <div className="flex items-center gap-4">
        {badge && (
          <div className={`flex items-center gap-1.5 px-2 py-1 border rounded-sm ${badge.className}`}>
            <badge.icon className="size-3" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider">{badge.label}</span>
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-[9px] font-mono text-muted-foreground uppercase leading-none">Coord</span>
          <span className="text-xs font-mono text-card-foreground">34.0522°N, 118.2437°W</span>
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex flex-col">
          <span className="text-[9px] font-mono text-muted-foreground uppercase leading-none">Pressure</span>
          <span className="text-xs font-mono text-neon-blue">1013.2 hPa</span>
        </div>
      </div>

      {/* Center: alert */}
      <div className="flex items-center gap-3 bg-destructive/5 border border-destructive/20 px-3 py-1 rounded">
        <div className="size-1.5 bg-destructive rounded-full animate-pulse" />
        <span className="text-[10px] font-mono font-bold text-destructive uppercase tracking-tighter">
          Alert: Severe Supercell - Sector 7G
        </span>
      </div>

      {/* Right: time + auth */}
      <div className="flex items-center gap-4">
        <div className="text-right">
          <span className="block text-[9px] font-mono text-muted-foreground leading-none">Mission Time</span>
          <span className="text-xs font-mono text-card-foreground">{zulu} Z</span>
        </div>

        {userRole === "guest" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onSignIn}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-mono text-[10px] font-bold uppercase tracking-wider rounded-sm hover:brightness-110 transition-all neon-glow-amber"
            >
              <LogIn className="size-3" />
              Sign In
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1 glass-panel cursor-pointer hover:border-primary/30 transition-colors">
            <div className="size-5 bg-secondary rounded flex items-center justify-center font-mono text-[9px] text-card-foreground">
              EV
            </div>
            <span className="text-[10px] font-mono text-card-foreground">VANCE</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </div>
        )}
      </div>
    </header>
  );
};

export default StatusBar;
