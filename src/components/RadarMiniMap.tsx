import { motion } from "framer-motion";

interface DataNode {
  label: string;
  value: string;
  unit: string;
  x: number;
  y: number;
  color: string;
  severity: "low" | "moderate" | "high" | "extreme";
}

const dataNodes: DataNode[] = [
  { label: "CAPE", value: "3,200", unit: "J/kg", x: 30, y: 25, color: "text-neon-red", severity: "extreme" },
  { label: "CIN", value: "-42", unit: "J/kg", x: 70, y: 20, color: "text-neon-blue", severity: "moderate" },
  { label: "0-6km SHEAR", value: "48", unit: "kts", x: 55, y: 55, color: "text-neon-amber", severity: "high" },
  { label: "0-1km SRH", value: "312", unit: "m²/s²", x: 25, y: 65, color: "text-neon-red", severity: "extreme" },
  { label: "LCL", value: "820", unit: "m", x: 75, y: 70, color: "text-neon-green", severity: "low" },
  { label: "STP", value: "4.8", unit: "", x: 50, y: 35, color: "text-neon-red", severity: "extreme" },
];

const severityBorder: Record<string, string> = {
  low: "border-neon-green/30",
  moderate: "border-neon-blue/30",
  high: "border-neon-amber/30",
  extreme: "border-destructive/40",
};

const RadarMiniMap = () => {
  return (
    <div className="glass-panel p-3 relative overflow-hidden" style={{ width: 280, height: 220 }}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Mesoscale Analysis
        </span>
        <span className="text-[9px] font-mono text-primary">POI: 34.05°N 118.24°W</span>
      </div>

      {/* Mini radar background */}
      <div className="relative w-full h-[170px] bg-background/60 rounded-sm overflow-hidden">
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--primary) / 0.2) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary) / 0.2) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Radar sweep */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {[40, 65, 90].map((r) => (
            <div
              key={r}
              className="absolute rounded-full border border-primary/8"
              style={{ width: r * 2, height: r * 2, top: -r, left: -r }}
            />
          ))}
          <motion.div
            className="absolute w-[90px] h-[1px] origin-left bg-gradient-to-r from-primary/40 to-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
          />
        </div>

        {/* Data nodes */}
        {dataNodes.map((node, i) => (
          <motion.div
            key={node.label}
            className={`absolute group cursor-pointer`}
            style={{ left: `${node.x}%`, top: `${node.y}%`, transform: "translate(-50%, -50%)" }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <div className={`px-1.5 py-0.5 bg-background/90 border ${severityBorder[node.severity]} rounded-sm`}>
              <div className="text-[7px] font-mono text-muted-foreground leading-none">{node.label}</div>
              <div className={`text-[10px] font-mono font-bold leading-tight ${node.color}`}>
                {node.value}
                <span className="text-[7px] text-muted-foreground ml-0.5">{node.unit}</span>
              </div>
            </div>
          </motion.div>
        ))}

        {/* Center POI marker */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="size-2 bg-primary rounded-full neon-glow-amber" />
          <div className="absolute inset-0 size-2 bg-primary rounded-full animate-ping opacity-30" />
        </div>
      </div>
    </div>
  );
};

export default RadarMiniMap;
