import { motion } from "framer-motion";
import { Wind, CloudHail, Eye, Tornado } from "lucide-react";

const reportButtons = [
  { label: "GALE", category: "WIND", icon: Wind, color: "neon-amber" },
  { label: "HAIL", category: "PRECIP", icon: CloudHail, color: "neon-red" },
  { label: "FOG", category: "VISIB", icon: Eye, color: "neon-blue" },
];

const TacticalMap = () => {
  return (
    <section className="flex-1 relative bg-background avionics-grid overflow-hidden">
      {/* Simulated radar overlay */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
        
        {/* Radar circles */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {[200, 300, 400].map((size) => (
            <div
              key={size}
              className="absolute rounded-full border border-primary/10"
              style={{
                width: size,
                height: size,
                top: -size / 2,
                left: -size / 2,
              }}
            />
          ))}
          <motion.div
            className="absolute w-[400px] h-[1px] origin-left bg-gradient-to-r from-primary/30 to-transparent"
            style={{ top: 0, left: 0 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
        </div>

        {/* Weather markers */}
        {[
          { top: "30%", left: "25%", color: "bg-neon-red" },
          { top: "55%", left: "60%", color: "bg-neon-amber" },
          { top: "40%", left: "45%", color: "bg-neon-blue" },
          { top: "65%", left: "30%", color: "bg-neon-green" },
        ].map((marker, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{ top: marker.top, left: marker.left }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.2, type: "spring" }}
          >
            <div className={`size-3 rounded-full ${marker.color} animate-pulse`} />
            <div className={`absolute inset-0 size-3 rounded-full ${marker.color} opacity-30 animate-ping`} />
          </motion.div>
        ))}
      </div>

      {/* Scanning status */}
      <div className="absolute top-6 left-6 flex flex-col gap-2 z-10">
        <div className="glass-panel p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-mono text-muted-foreground">SCANNING RADIAL</span>
            <span className="text-[10px] font-mono text-neon-green uppercase">Active</span>
          </div>
          <div className="w-48 h-1 bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-neon-green neon-glow-green rounded-full"
              animate={{ width: ["0%", "100%"] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
          </div>
        </div>
      </div>

      {/* Quick report buttons */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-10">
        {reportButtons.map((btn) => (
          <button
            key={btn.label}
            className="px-5 py-3 glass-panel hover:border-primary/50 transition-all group flex flex-col items-center gap-1 min-w-[90px]"
          >
            <span className="text-[10px] font-mono text-muted-foreground group-hover:text-primary transition-colors">
              {btn.category}
            </span>
            <span className="text-lg font-mono text-card-foreground tracking-widest">
              {btn.label}
            </span>
          </button>
        ))}
        <button className="px-5 py-3 bg-primary text-primary-foreground font-bold flex flex-col items-center gap-1 min-w-[120px] neon-glow-amber hover:brightness-110 transition-all rounded-sm">
          <span className="text-[10px] font-mono tracking-tighter opacity-70">EMERGENCY</span>
          <span className="text-lg font-mono tracking-widest">TORNADO</span>
        </button>
      </div>
    </section>
  );
};

export default TacticalMap;
