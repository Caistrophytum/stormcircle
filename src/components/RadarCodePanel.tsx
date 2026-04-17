import { useState, useCallback, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Lock, Unlock } from "lucide-react";

const tiltAngles = [0.5, 0.9, 1.3, 1.8, 2.4, 3.1, 4.0, 5.1];

interface Props {
  /** Available-space scale (0..1). Drives font sizes so the panel shrinks gracefully. */
  scale?: number;
}

const RadarCodePanel = ({ scale = 1 }: Props) => {
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

  // Derive font sizes from available-space scale.
  // Use an exponential curve so shrinking is visibly more aggressive than linear.
  const fontScale = Math.pow(scale, 2.2);
  const headerSize = `${(13.5 * fontScale).toFixed(2)}px`;
  const tiltSize = `${(9.75 * fontScale).toFixed(2)}px`;
  const labelSize = `${(9.75 * fontScale).toFixed(2)}px`;

  return (
    <div className="glass-panel p-3 w-full">
      <div className="flex justify-between items-center mb-2">
        <span
          className="font-mono text-primary uppercase tracking-wider"
          style={{ fontSize: headerSize }}
        >
          RDA {scanAngle.toFixed(1)}°
        </span>
        <span
          className="font-mono text-neon-green uppercase flex items-center gap-1"
          style={{ fontSize: headerSize }}
        >
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
              className={`px-1 py-0.5 font-mono rounded-sm transition-colors ${
                scanAngle === a
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
              style={{ fontSize: tiltSize }}
            >
              {a}°
            </button>
          ))}
        </div>
      </div>

      {/* Speed control */}
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-muted-foreground w-8"
          style={{ fontSize: labelSize }}
        >
          SPD
        </span>
        <Slider
          value={[speed]}
          onValueChange={(v) => setSpeed(v[0])}
          min={500}
          max={5000}
          step={100}
          className="flex-1"
        />
        <span
          className="font-mono text-primary w-10 text-right"
          style={{ fontSize: labelSize }}
        >
          {(speed / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  );
};

export default RadarCodePanel;
