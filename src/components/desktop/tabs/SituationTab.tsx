/**
 * SituationTab — convective outlook → fire risk → current hazards (in that order).
 * Empty sections collapse; if all empty, show "Situation's Calm Here."
 * Includes the Exercise button up top.
 */
import { lazy, Suspense, useState, useMemo } from "react";
import { Activity as ActivityIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useUnitSystem, displayLengthKm } from "@/hooks/useUnitSystem";
import { useHomeCityRisk, type SPCRiskLevel } from "@/hooks/useHomeCityRisk";
import { useHomeCityFireRisk, type FireRiskLevel } from "@/hooks/useHomeCityFireRisk";
import { useWarningPolygons } from "@/hooks/useWarningPolygons";
import { pointInPolygon } from "@/lib/pointInPolygon";
import { useWRSMetrics } from "@/hooks/useWRSMetrics";
import CurrentLocationHazards from "@/components/CurrentLocationHazards";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const ExerciseComfort = lazy(() => import("@/components/ExerciseComfort"));

const SPC_COLOR: Record<SPCRiskLevel, string> = {
  NONE: "hsl(142 100% 50%)",
  TSTM: "hsl(142 60% 55%)",
  MRGL: "hsl(120 60% 50%)",
  SLGT: "hsl(50 95% 55%)",
  ENH: "hsl(28 95% 55%)",
  MDT: "hsl(0 80% 55%)",
  HIGH: "hsl(280 70% 60%)",
};
const SPC_TEXT: Record<SPCRiskLevel, string> = {
  NONE: "No Severe Risk",
  TSTM: "General Thunderstorm",
  MRGL: "Marginal Risk",
  SLGT: "Slight Risk",
  ENH: "Enhanced Risk",
  MDT: "Moderate Risk",
  HIGH: "High Risk",
};
const FIRE_COLOR: Record<FireRiskLevel, string> = {
  NONE: "hsl(142 100% 50%)",
  ELEV: "hsl(50 95% 55%)",
  CRIT: "hsl(20 95% 55%)",
  EXTM: "hsl(0 80% 55%)",
};
const FIRE_TEXT: Record<FireRiskLevel, string> = {
  NONE: "No Fire Weather Risk",
  ELEV: "Elevated Fire Weather",
  CRIT: "Critical Fire Weather",
  EXTM: "Extreme Fire Weather",
};

function GlowCard({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-xl p-3"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${color}66`,
        boxShadow: `inset 0 0 20px ${color}18, 0 0 12px ${color}22`,
        transition: "border-color 500ms ease, box-shadow 500ms ease",
      }}
    >
      {children}
    </motion.div>
  );
}

export default function SituationTab() {
  const { profile } = useAuth();
  const location = profile?.location ?? null;
  const homeRisk = useHomeCityRisk(location);
  const fireRisk = useHomeCityFireRisk(location);
  const { polygons } = useWarningPolygons();
  const { threatLevel } = useWRSMetrics();
  const [comfortOpen, setComfortOpen] = useState(false);

  const hazards = useMemo(() => {
    if (!homeRisk.coords) return [];
    return polygons.filter(
      (p) => p.geometry && pointInPolygon(homeRisk.coords!.lon, homeRisk.coords!.lat, p.geometry),
    );
  }, [polygons, homeRisk.coords]);
  const showHazards = hazards.length > 0;

  // Nearest convective warning (Tornado / Severe Thunderstorm / Flash Flood).
  const nearestConvective = useMemo(() => {
    if (!homeRisk.coords) return null;
    const CONV = /(Tornado|Thunderstorm|Flash Flood|Severe)/i;
    const { lat, lon } = homeRisk.coords;
    let best: { event: string; km: number } | null = null;
    for (const p of polygons) {
      if (!p.geometry || !CONV.test(p.event)) continue;
      const coords: number[][] =
        p.geometry.type === "Polygon"
          ? p.geometry.coordinates[0]
          : p.geometry.coordinates[0]?.[0] ?? [];
      let min = Infinity;
      for (const [plon, plat] of coords) {
        const d = haversineKm(lat, lon, plat, plon);
        if (d < min) min = d;
      }
      if (best === null || min < best.km) best = { event: p.event, km: min };
    }
    return best;
  }, [polygons, homeRisk.coords]);

  const nothing = !showHazards && homeRisk.risk === "NONE" && fireRisk.risk === "NONE" && !nearestConvective;

  return (
    <div className="flex flex-col gap-3 p-4">
      <button
        onClick={() => setComfortOpen(true)}
        className="group flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest transition-all"
        style={{
          background: "rgba(255,157,0,0.08)",
          border: "1px solid rgba(255,157,0,0.5)",
          color: "hsl(36 100% 55%)",
          boxShadow: "inset 0 0 12px rgba(255,157,0,0.15), 0 0 12px rgba(255,157,0,0.25)",
        }}
      >
        <ActivityIcon size={14} />
        Exercise Comfort
      </button>

      {nothing ? (
        <div
          className="rounded-xl px-4 py-8 text-center font-mono"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(142,255,180,0.4)",
            boxShadow: "inset 0 0 20px rgba(142,255,180,0.1), 0 0 12px rgba(142,255,180,0.15)",
            color: "hsl(142 100% 60%)",
          }}
        >
          <div className="text-xs uppercase tracking-widest">Situation's Calm Here.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <GlowCard color={SPC_COLOR[homeRisk.risk]}>
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              Convective Outlook
            </div>
            <div
              className="mt-1 font-mono text-sm font-bold uppercase tracking-wider"
              style={{ color: SPC_COLOR[homeRisk.risk] }}
            >
              {SPC_TEXT[homeRisk.risk]}
            </div>
            <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Nearest Warning:{" "}
              {nearestConvective ? (
                <span style={{ color: SPC_COLOR[homeRisk.risk] }}>
                  {nearestConvective.event} — {nearestConvective.km < 1 ? "at your location" : `${nearestConvective.km.toFixed(0)} km`}
                </span>
              ) : (
                <span className="text-[hsl(142_100%_60%)]">None active</span>
              )}
            </div>
          </GlowCard>
          <GlowCard color={FIRE_COLOR[fireRisk.risk]}>
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              Fire Risk
            </div>
            <div
              className="mt-1 font-mono text-sm font-bold uppercase tracking-wider"
              style={{ color: FIRE_COLOR[fireRisk.risk] }}
            >
              {FIRE_TEXT[fireRisk.risk]}
            </div>
          </GlowCard>
          {showHazards && (
            <GlowCard color="hsl(0 100% 60%)">
              <CurrentLocationHazards
                polygons={polygons}
                coords={homeRisk.coords}
                cityLabel={null}
              />
            </GlowCard>
          )}
        </div>
      )}

      {comfortOpen && (
        <Suspense fallback={null}>
          <ExerciseComfort open={comfortOpen} onClose={() => setComfortOpen(false)} wrs={threatLevel} />
        </Suspense>
      )}
    </div>
  );
}
