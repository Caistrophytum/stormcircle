import { motion } from "framer-motion";
import { Maximize2, Minimize2 } from "lucide-react";

interface DataNode {
  label: string;
  value: string;
  unit: string;
  color: string;
  severity: "low" | "moderate" | "high" | "extreme";
}

const dataNodes: DataNode[] = [
  { label: "CAPE", value: "3,200", unit: "J/kg", color: "text-neon-red", severity: "extreme" },
  { label: "CIN", value: "-42", unit: "J/kg", color: "text-neon-blue", severity: "moderate" },
  { label: "0-6km SHEAR", value: "48", unit: "kts", color: "text-neon-amber", severity: "high" },
  { label: "0-1km SRH", value: "312", unit: "m²/s²", color: "text-neon-red", severity: "extreme" },
  { label: "LCL", value: "820", unit: "m", color: "text-neon-green", severity: "low" },
  { label: "STP", value: "4.8", unit: "", color: "text-neon-red", severity: "extreme" },
];

const severityBorder: Record<string, string> = {
  low: "border-neon-green/30",
  moderate: "border-neon-blue/30",
  high: "border-neon-amber/30",
  extreme: "border-destructive/40",
};

interface Props {
  expanded: boolean;
  onCollapse: () => void;
}

const RadarMiniMap = ({ expanded, onCollapse }: Props) => {
  if (!expanded) {
    // Collapsed: 9:16 vertical radar card
    return (
      <button
        onClick={onCollapse}
        className="glass-panel p-3 flex items-center gap-3 hover:border-primary/50 transition-all cursor-pointer group"
        style={{ aspectRatio: "16/9", width: "clamp(200px, 22vw, 340px)" }}
      >
        {/* Radar circle */}
        <div className="relative shrink-0 self-stretch flex items-center justify-center" style={{ aspectRatio: "1/1", height: "100%" }}>
          <div className="absolute inset-1 rounded-full bg-background/60 overflow-hidden">
            {/* Grid */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "linear-gradient(to right, hsl(var(--primary) / 0.2) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary) / 0.2) 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            />
            {/* Rings */}
            {[25, 37, 48].map((r) => (
              <div
                key={r}
                className="absolute rounded-full border border-primary/10"
                style={{ width: `${r * 2}%`, height: `${r * 2}%`, top: `${50 - r}%`, left: `${50 - r}%` }}
              />
            ))}
            {/* Sweep */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <motion.div
                className="absolute w-[48%] h-[1px] origin-left bg-gradient-to-r from-primary/40 to-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
              />
            </div>
            {/* Center dot */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="size-1.5 bg-primary rounded-full neon-glow-amber" />
            </div>
          </div>
          <Maximize2 className="absolute top-0 right-0 size-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Side info nodes */}
        <div className="flex flex-col gap-1 flex-1 min-w-0 justify-center">
          {dataNodes.slice(0, 4).map((node) => (
            <div key={node.label} className="flex items-baseline justify-between gap-1">
              <span className="text-[7px] font-mono text-muted-foreground truncate">{node.label}</span>
              <span className={`text-[9px] font-mono font-bold ${node.color} whitespace-nowrap`}>
                {node.value}
                <span className="text-[6px] text-muted-foreground ml-0.5">{node.unit}</span>
              </span>
            </div>
          ))}
        </div>
      </button>
    );
  }

  // Expanded: full radar view covering the background
  return (
    <div className="glass-panel p-4 w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Mesoscale Analysis
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-primary">POI: 34.05°N 118.24°W</span>
          <button
            onClick={onCollapse}
            className="glass-panel p-1 hover:border-primary/50 transition-colors"
          >
            <Minimize2 className="size-3 text-primary" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4">
        {/* Large radar circle */}
        <div className="flex-1 relative bg-background/60 rounded-sm overflow-hidden">
          {/* Grid */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(to right, hsl(var(--primary) / 0.2) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary) / 0.2) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          {/* Radar rings */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            {[60, 100, 140, 180].map((r) => (
              <div
                key={r}
                className="absolute rounded-full border border-primary/8"
                style={{ width: r * 2, height: r * 2, top: -r, left: -r }}
              />
            ))}
            <motion.div
              className="absolute w-[180px] h-[1px] origin-left bg-gradient-to-r from-primary/40 to-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            />
          </div>

          {/* Center POI */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="size-3 bg-primary rounded-full neon-glow-amber" />
            <div className="absolute inset-0 size-3 bg-primary rounded-full animate-ping opacity-30" />
          </div>

          {/* Scattered weather markers in expanded view */}
          {[
            { top: "25%", left: "30%", color: "bg-neon-red" },
            { top: "60%", left: "65%", color: "bg-neon-amber" },
            { top: "35%", left: "55%", color: "bg-neon-blue" },
            { top: "70%", left: "25%", color: "bg-neon-green" },
          ].map((m, i) => (
            <motion.div
              key={i}
              className="absolute"
              style={{ top: m.top, left: m.left }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.1, type: "spring" }}
            >
              <div className={`size-2.5 rounded-full ${m.color} animate-pulse`} />
            </motion.div>
          ))}
        </div>

        {/* Info panel on the side */}
        <div className="w-48 flex flex-col gap-2 shrink-0">
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
            Environment Parameters
          </span>
          {dataNodes.map((node, i) => (
            <motion.div
              key={node.label}
              className={`px-2 py-1.5 bg-background/90 border ${severityBorder[node.severity]} rounded-sm`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="text-[8px] font-mono text-muted-foreground leading-none">{node.label}</div>
              <div className={`text-sm font-mono font-bold leading-tight ${node.color}`}>
                {node.value}
                <span className="text-[8px] text-muted-foreground ml-1">{node.unit}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RadarMiniMap;
