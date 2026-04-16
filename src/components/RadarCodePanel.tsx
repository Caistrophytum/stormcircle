import { useState, useCallback, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Lock, Unlock } from "lucide-react";

const tiltAngles = [0.5, 0.9, 1.3, 1.8, 2.4, 3.1, 4.0, 5.1];

const RadarCodePanel = () => {
  const [scanAngle, setScanAngle] = useState(0.5);
  const [tiltLocked, setTiltLocked] = useState(false);
  const [speed, setSpeed] = useState(1200);

  const advanceTilt = useCallback(() => {
    if (tiltLocked) return;
    setScanAngle((prev) => {
      const idx = tiltAngles.indexOf(prev);
      return tiltAngles[(idx + 1) % tiltAngles.length];
    });
  }, [tiltLocked]);

  useEffect(() => {
    const interval = setInterval(advanceTilt, speed);
    return () => clearInterval(interval);
  }, [speed, advanceTilt]);

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

      {/* Tilt lock/select */}
      <div className="flex items-center gap-2 mb-2">
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
    </div>
  );
};

export default RadarCodePanel;
