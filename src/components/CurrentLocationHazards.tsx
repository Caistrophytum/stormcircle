/**
 * CurrentLocationHazards — lists every active hazard (warning, watch,
 * advisory, statement) whose polygon contains the user's home city.
 *
 * Transparent background; each row is outlined and texted in the hazard's
 * polygon color. Renders nothing when there are no coords or no matches,
 * so the parent layout collapses naturally.
 */
import { useMemo } from "react";
import {
  type WarningPolygon,
  getWarningColor,
  getExpiresLabel,
} from "@/hooks/useWarningPolygons";
import { pointInPolygon } from "@/lib/pointInPolygon";

function severityRank(p: WarningPolygon): number {
  const ev = p.event ?? "";
  const haystack = `${p.description ?? ""} ${p.headline ?? ""}`.toLowerCase();
  if (ev === "Tornado Warning") {
    if (haystack.includes("tornado emergency")) return 100;
    if (/particularly dangerous situation|\bpds\b/.test(haystack)) return 90;
    return 80;
  }
  if (ev === "Flash Flood Warning") {
    if (haystack.includes("flash flood emergency")) return 75;
    return 60;
  }
  if (ev === "Severe Thunderstorm Warning") {
    if (/particularly dangerous situation|\bpds\b/.test(haystack)) return 55;
    return 50;
  }
  if (ev.endsWith("Warning")) return 40;
  if (ev.endsWith("Watch")) return 30;
  if (ev.endsWith("Advisory")) return 20;
  if (ev.endsWith("Statement")) return 10;
  return 0;
}

interface Props {
  polygons: WarningPolygon[];
  coords: { lat: number; lon: number } | null;
  cityLabel: string | null;
  /** Optional style override for the outer container (positioning). */
  style?: React.CSSProperties;
  className?: string;
}

export default function CurrentLocationHazards({
  polygons,
  coords,
  cityLabel,
  style,
  className,
}: Props) {
  const hits = useMemo(() => {
    if (!coords) return [];
    const matched = polygons.filter(
      (p) => p.geometry && pointInPolygon(coords.lon, coords.lat, p.geometry),
    );
    // Dedupe by event: NWS frequently re-issues the same product (e.g. Air
    // Quality Alert) every few hours with a new alert_id but identical event
    // + area. From a single point's perspective those are the same hazard,
    // so we keep the instance with the latest expiry (newest re-issue).
    const byEvent = new Map<string, WarningPolygon>();
    for (const p of matched) {
      const key = p.event ?? "";
      const prev = byEvent.get(key);
      if (!prev) { byEvent.set(key, p); continue; }
      const pe = new Date(p.expires).getTime() || 0;
      const pp = new Date(prev.expires).getTime() || 0;
      if (pe > pp) byEvent.set(key, p);
    }
    return Array.from(byEvent.values()).sort((a, b) => {
      const r = severityRank(b) - severityRank(a);
      if (r !== 0) return r;
      const ea = new Date(a.expires).getTime() || Infinity;
      const eb = new Date(b.expires).getTime() || Infinity;
      return ea - eb;
    });
  }, [polygons, coords]);

  if (!coords || hits.length === 0) return null;

  return (
    <div
      className={className}
      style={{
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "10px",
          letterSpacing: "0.15em",
          color: "hsl(var(--muted-foreground))",
          textTransform: "uppercase",
        }}
      >
        Current Hazards{cityLabel ? ` — ${cityLabel}` : ""}
      </div>
      {hits.map((p) => {
        const color = getWarningColor({
          event: p.event,
          description: p.description,
          headline: p.headline,
          parameters: p.parameters,
          certainty: p.certainty,
        });
        return (
          <div
            key={p.id}
            style={{
              border: `1px solid ${color}`,
              background: "transparent",
              padding: "6px 10px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              fontFamily: "'JetBrains Mono', monospace",
              borderRadius: "2px",
            }}
          >
            <div
              style={{
                color,
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                lineHeight: 1.2,
              }}
            >
              {p.event}
            </div>
            <div
              style={{
                color,
                fontSize: "10px",
                opacity: 0.85,
                lineHeight: 1.3,
              }}
            >
              {getExpiresLabel(p.expires)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
