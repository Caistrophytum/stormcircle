/**
 * ExerciseComfort — modal panel that scores outdoor activity comfort for the
 * user's home city over the next 6 hours. Reachable from a top-center button
 * on desktop and a bottom-nav icon on mobile.
 *
 * Score model lives in `@/lib/exerciseComfort`. This component only wires
 * data sources together:
 *   • Home city coords via `useHomeCityRisk` (already used elsewhere, so this
 *     component doesn't trigger a second geocode).
 *   • 6-hour weather + AQ via `useExerciseComfortData`.
 *   • Active alerts that CONTAIN the home point via `useWarningPolygons`
 *     (deduped by event, mirroring `CurrentLocationHazards`).
 *   • SPC categorical, SPC fire outlook, and WRS threat via existing hooks.
 */
import { useMemo } from "react";
import { AlertTriangle, Bike, Footprints, Mountain, PersonStanding } from "lucide-react";
import FloatingWindow from "@/components/desktop/FloatingWindow";
import { useAuth } from "@/hooks/useAuth";
import { useHomeCityRisk } from "@/hooks/useHomeCityRisk";
import { useHomeCityFireRisk } from "@/hooks/useHomeCityFireRisk";
import { useWarningPolygons } from "@/hooks/useWarningPolygons";
import { pointInPolygon } from "@/lib/pointInPolygon";
import { useExerciseComfortData } from "@/hooks/useExerciseComfortData";
import {
  computeAllActivities,
  type Activity,
  type ActivityResult,
  type ComfortTier,
} from "@/lib/exerciseComfort";

interface Props {
  open: boolean;
  onClose: () => void;
  /** WRS threat number (0–100) from the caller. Optional; defaults to 0. */
  wrs?: number;
}

const TIER_COLOR: Record<ComfortTier, string> = {
  Ideal: "#00ff88",
  Good: "#a3e635",
  Fair: "#facc15",
  Poor: "#fb923c",
  Dangerous: "#ff4d4d",
};

const ACTIVITY_META: Record<Activity, { label: string; Icon: typeof Bike }> = {
  walk: { label: "Walk", Icon: Footprints },
  run: { label: "Run", Icon: PersonStanding },
  bike: { label: "Bike", Icon: Bike },
  hike: { label: "Hike", Icon: Mountain },
};

function ScoreRow({ r }: { r: ActivityResult }) {
  const meta = ACTIVITY_META[r.activity];
  const Icon = meta.Icon;
  const color = TIER_COLOR[r.now.tier];
  const bestColor = TIER_COLOR[r.best.tier];
  const bestTimeLabel = (() => {
    if (!r.best.time || r.best.time === r.now.time) return "now";
    // "2026-07-01T14:00" → "14:00Z"
    return r.best.time.slice(11, 16) + "Z";
  })();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: "12px",
        alignItems: "center",
        padding: "12px 14px",
        borderTop: "1px solid rgba(255,157,0,0.15)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          border: `1px solid ${color}66`,
          background: `${color}12`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color,
          flexShrink: 0,
        }}
      >
        <Icon size={22} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.03em" }}>
            {meta.label.toUpperCase()}
          </span>
          <span style={{ fontSize: 11, color: "#a1a1aa" }}>
            best next 6 h:{" "}
            <span style={{ color: bestColor, fontWeight: 700 }}>
              {r.best.score} {r.best.tier}
            </span>{" "}
            @ {bestTimeLabel}
          </span>
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: "#d4d4d8",
            marginTop: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={r.now.limiter}
        >
          Limiter: <span style={{ color }}>{r.now.limiter}</span>
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>
          {r.now.score}
        </div>
        <div style={{ fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {r.now.tier}
        </div>
      </div>
    </div>
  );
}

export default function ExerciseComfort({ open, onClose, wrs = 0 }: Props) {
  const { profile } = useAuth();
  const location = profile?.location ?? null;
  const home = useHomeCityRisk(location);
  const fire = useHomeCityFireRisk(location);
  const polygons = useWarningPolygons();
  const data = useExerciseComfortData(home.coords);

  // Dedupe warnings by event, only those whose polygon covers the home point.
  const activeWarnings = useMemo(() => {
    if (!home.coords) return [] as string[];
    const { lat, lon } = home.coords;
    const set = new Set<string>();
    for (const p of polygons.polygons) {
      if (!p.geometry) continue;
      if (pointInPolygon(lon, lat, p.geometry)) set.add(p.event);
    }
    return Array.from(set);
  }, [polygons.polygons, home.coords]);

  const results = useMemo(() => {
    if (!data.hourly.length) return [] as ActivityResult[];
    return computeAllActivities({
      hourly: data.hourly,
      airQuality: data.airQuality,
      activeWarnings,
      spcRisk: home.risk,
      fireRisk: fire.risk,
      wrs,
    });
  }, [data.hourly, data.airQuality, activeWarnings, home.risk, fire.risk, wrs]);

  const hasLocation = !!location;
  const loading = data.loading && !data.hourly.length;

  return (
    <FloatingWindow
      open={open}
      onClose={onClose}
      title="Exercise Comfort"
      subtitle={hasLocation ? `${location} — now + next 6 h` : "Set a hometown to compute local comfort"}
      accent="255,157,0"
    >
      <div style={{ fontFamily: "'JetBrains Mono', monospace", color: "#e8e8e8" }}>
        {!hasLocation && (
          <div style={{ padding: 20, fontSize: 12, color: "#d4d4d8" }}>
            Open your Account Center and set a hometown. Exercise comfort scores use your
            home coordinates for weather, air quality, and local hazard checks.
          </div>
        )}
        {hasLocation && loading && (
          <div style={{ padding: 20, fontSize: 12, color: "#a1a1aa" }}>Loading forecast…</div>
        )}
        {hasLocation && !loading && !results.length && (
          <div style={{ padding: 20, fontSize: 12, color: "#ff6b6b" }}>
            Couldn't load the forecast — try again in a minute.
          </div>
        )}
        {activeWarnings.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              padding: "10px 14px",
              background: "rgba(255,77,77,0.08)",
              borderBottom: "1px solid rgba(255,77,77,0.25)",
              color: "#ffb4b4",
              fontSize: 11,
            }}
          >
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, color: "#ff9d9d" }}>Active alerts at your location</div>
              <div style={{ marginTop: 2 }}>{activeWarnings.join(" • ")}</div>
            </div>
          </div>
        )}
        {results.map((r) => (
          <ScoreRow key={r.activity} r={r} />
        ))}
        <div
          style={{
            padding: "8px 14px",
            borderTop: "1px solid rgba(255,157,0,0.18)",
            fontSize: 9.5,
            color: "#71717a",
            lineHeight: 1.5,
          }}
        >
          0–100 (Ideal ≥ 80, Good ≥ 60, Fair ≥ 40, Poor ≥ 20, Dangerous &lt; 20). Model blends
          apparent temperature, wind, precip, UV, US AQI, active NWS alerts (hard downgrade), and
          SPC / Fire / WRS outlooks (soft downgrade).
        </div>
      </div>
    </FloatingWindow>
  );
}
