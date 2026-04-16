import { motion } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { Lock, Unlock } from "lucide-react";

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

const tiltAngles = [0.5, 0.9, 1.3, 1.8, 2.4, 3.1, 4.0, 5.1];

const RadarCodePanel = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [scanAngle, setScanAngle] = useState(0.5);
  const [tiltLocked, setTiltLocked] = useState(false);
  const [speed, setSpeed] = useState(1200); // ms between updates
  const [showControls, setShowControls] = useState(false);

  const advanceTilt = useCallback(() => {
    if (tiltLocked) return;
    setScanAngle((prev) => {
      const idx = tiltAngles.indexOf(prev);
      return tiltAngles[(idx + 1) % tiltAngles.length];
    });
  }, [tiltLocked]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLines((prev) => {
        const next = [...prev, radarCodes[Math.floor(Math.random() * radarCodes.length)]];
        return next.slice(-6);
      });
      advanceTilt();
    }, speed);
    return () => clearInterval(interval);
  }, [speed, advanceTilt]);

  return (
    <div className="glass-panel p-3 w-56">
      <div className="flex justify-between items-center mb-2">
        <button
          onClick={() => setShowControls(!showControls)}
          className="text-[10px] font-mono text-primary uppercase tracking-wider hover:text-primary/80 transition-colors"
        >
          RDA {scanAngle.toFixed(1)}°
        </button>
        <span className="text-[10px] font-mono text-neon-green uppercase flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-neon-green animate-pulse" />
          LIVE
        </span>
      </div>

      {/* Tilt & Speed Controls */}
      {showControls && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="mb-2 space-y-2 overflow-hidden"
        >
          {/* Tilt lock/select */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTiltLocked(!tiltLocked)}
              className={`p-1 rounded-sm transition-colors ${
                tiltLocked ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              title={tiltLocked ? "Unlock tilt cycling" : "Lock current tilt"}
            >
              {tiltLocked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
            </button>
            <div className="flex gap-0.5 flex-wrap flex-1">
              {tiltAngles.map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    setScanAngle(a);
                    setTiltLocked(true);
                  }}
                  className={`px-1 py-0.5 text-[7px] font-mono rounded-sm transition-colors ${
                    scanAngle === a
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground border border-transparent"
                  }`}
                >
                  {a}°
                </button>
              ))}
            </div>
          </div>

          {/* Speed control */}
          <div className="flex items-center gap-2">
            <span className="text-[7px] font-mono text-muted-foreground w-8">SPD</span>
            <Slider
              value={[speed]}
              onValueChange={(v) => setSpeed(v[0])}
              min={500}
              max={5000}
              step={100}
              className="flex-1"
            />
            <span className="text-[7px] font-mono text-primary w-10 text-right">{(speed / 1000).toFixed(1)}s</span>
          </div>
        </motion.div>
      )}

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
          transition={{ duration: speed / 1000, repeat: Infinity }}
        />
      </div>
    </div>
  );
};

export default RadarCodePanel;
