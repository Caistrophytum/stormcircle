import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const radarCodes = [
  "NEXRAD L2 VOL 0.5° ELEV",
  "REFLECTIVITY DBZ 55+",
  "VEL COUPLET DET 42kts",
  "MESO SHEAR 0.012/s",
  "HAIL PROB 78% POSH",
  "TVS GATE 12.4nm AZ 247°",
  "SRM BASE 0.9° TILT",
  "CC 0.92 ZDR 3.1dB",
  "KDP 2.8°/km PHI_DP 142°",
  "ECHO TOP 48kft FL480",
  "VIL 62kg/m² MAXZ 67dBZ",
  "SPWD 85kts MXDV 52kts",
];

const RadarCodePanel = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [scanAngle, setScanAngle] = useState(0.5);

  useEffect(() => {
    const interval = setInterval(() => {
      setLines((prev) => {
        const next = [...prev, radarCodes[Math.floor(Math.random() * radarCodes.length)]];
        return next.slice(-6);
      });
      setScanAngle((prev) => {
        const angles = [0.5, 0.9, 1.3, 1.8, 2.4, 3.1, 4.0, 5.1];
        const idx = angles.indexOf(prev);
        return angles[(idx + 1) % angles.length];
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-panel p-3 w-56">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] font-mono text-primary uppercase tracking-wider">
          RDA {scanAngle.toFixed(1)}°
        </span>
        <span className="text-[10px] font-mono text-neon-green uppercase flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-neon-green animate-pulse" />
          LIVE
        </span>
      </div>
      <div className="space-y-0.5 min-h-[72px]">
        {lines.map((line, i) => (
          <motion.div
            key={`${line}-${i}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: i === lines.length - 1 ? 1 : 0.4, x: 0 }}
            className="text-[9px] font-mono text-neon-green/80 leading-tight truncate"
          >
            &gt; {line}
          </motion.div>
        ))}
      </div>
      <div className="mt-2 w-full h-0.5 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-neon-green neon-glow-green rounded-full"
          animate={{ width: ["0%", "100%"] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      </div>
    </div>
  );
};

export default RadarCodePanel;
