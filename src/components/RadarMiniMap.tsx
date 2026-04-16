import { useState } from "react";
import { motion } from "framer-motion";
import { Maximize2, Minimize2 } from "lucide-react";

const radarProducts = [
  { id: "BR", label: "Base Reflectivity" },
  { id: "BV", label: "Base Velocity" },
  { id: "SRV", label: "Storm Rel. Velocity" },
  { id: "ZDR", label: "Diff. Reflectivity" },
  { id: "KDP", label: "Specific Diff. Phase" },
  { id: "CC", label: "Correlation Coeff." },
  { id: "VIL", label: "Vert. Int. Liquid" },
  { id: "EET", label: "Enh. Echo Tops" },
  { id: "HC", label: "Hydrometeor Class." },
] as const;

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
  const [selectedProduct, setSelectedProduct] = useState("BR");
  if (!expanded) {
    const circleSize = "clamp(160px, 18vw, 240px)";

    return (
      <div
        onClick={onCollapse}
        className="relative cursor-pointer group"
        style={{ width: circleSize, height: circleSize }}
      >
        {/* Circular radar */}
        <div className="absolute inset-0 rounded-full glass-panel overflow-hidden group-hover:border-primary/50 transition-colors">
          <div className="absolute inset-1 rounded-full bg-background/60 overflow-hidden">
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "linear-gradient(to right, hsl(var(--primary) / 0.2) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary) / 0.2) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            />
            {[20, 32, 44].map((r) => (
              <div
                key={r}
                className="absolute rounded-full border border-primary/10"
                style={{ width: `${r * 2}%`, height: `${r * 2}%`, top: `${50 - r}%`, left: `${50 - r}%` }}
              />
            ))}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <motion.div
                className="absolute w-[44%] h-[1px] origin-left bg-gradient-to-r from-primary/40 to-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
              />
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="size-2 bg-primary rounded-full neon-glow-amber" />
            </div>
          </div>
          <Maximize2 className="absolute top-2 right-2 size-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity z-20" />
        </div>
      </div>
    );
  }

  // Expanded: full radar view — 1:1 square + sidebar
  return (
    <div className="flex gap-3" style={{ height: "min(65vw, 620px)" }}>
      {/* Product sidebar */}
      <div className="w-[160px] shrink-0 glass-panel p-2 flex flex-col overflow-y-auto">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider px-1 mb-1.5">
          Products
        </span>
        <div className="flex flex-col gap-1.5 flex-1">
          {radarProducts.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProduct(p.id)}
              className={`flex-1 px-1.5 text-[9px] font-mono leading-tight rounded-sm border transition-colors text-center flex items-center justify-center ${
                selectedProduct === p.id
                  ? "bg-primary/20 text-primary border-primary/40 font-bold"
                  : "bg-background/60 text-muted-foreground border-border hover:text-foreground hover:border-primary/20"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main radar panel */}
      <div className="glass-panel p-4 flex flex-col" style={{ width: "min(65vw, 620px)", height: "100%" }}>
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-mono text-muted-foreground uppercase tracking-wider">
              Mesoscale Analysis
            </span>
            <span className="text-[11px] font-mono text-primary/80 bg-primary/10 px-2 py-0.5 rounded-sm">
              {radarProducts.find((p) => p.id === selectedProduct)?.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-mono text-primary">POI: 34.05°N 118.24°W</span>
            <button
              onClick={onCollapse}
              className="glass-panel p-1 hover:border-primary/50 transition-colors"
            >
              <Minimize2 className="size-4 text-primary" />
            </button>
          </div>
        </div>

        {/* Radar code */}
        <div className="mb-3 px-2 py-1.5 bg-background/80 border border-border rounded-sm">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">RADAR CODE: </span>
          <span className="text-[13px] font-mono text-primary font-bold tracking-wider">KTLX — OKLAHOMA CITY, OK</span>
        </div>

        {/* Large radar — fills remaining space */}
        <div className="flex-1 relative bg-background/60 rounded-sm overflow-hidden">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(to right, hsl(var(--primary) / 0.2) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary) / 0.2) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          {/* Coordinates on edges */}
          <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[13px] font-mono text-primary/60">36.0°N</span>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[13px] font-mono text-primary/60">34.0°N</span>
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] font-mono text-primary/60">-98.5°W</span>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[13px] font-mono text-primary/60">-96.5°W</span>

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
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="size-3 bg-primary rounded-full neon-glow-amber" />
            <div className="absolute inset-0 size-3 bg-primary rounded-full animate-ping opacity-30" />
          </div>
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
      </div>
    </div>
  );
};

export default RadarMiniMap;
