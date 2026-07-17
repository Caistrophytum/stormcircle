/**
 * RadarReportsTab — two full-width buttons stacked vertically:
 *   • Live Radar   → opens NEXRAD floating window
 *   • Live Reports → opens weather-reports feed in a floating window
 */
import { lazy, Suspense, useState } from "react";
import { Radar as RadarIcon, Radio, Maximize2 } from "lucide-react";
import FloatingWindow from "@/components/desktop/FloatingWindow";
import IntegrationPanel from "@/components/IntegrationPanel";
import { PRODUCTS, type ProductCode } from "@/hooks/useRadar";
import { useRadarContext } from "@/contexts/RadarContext";
import RadarControls from "@/components/RadarControls";

const LeafletRadar = lazy(() =>
  import("@/components/RadarMiniMap").then((m) => ({ default: m.LeafletRadar })),
);

export default function RadarReportsTab() {
  const [radarOpen, setRadarOpen] = useState(false);
  const [radarFullOpen, setRadarFullOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const radar = useRadarContext();

  const btnStyle = (accent: string): React.CSSProperties => ({
    background: "rgba(255,255,255,0.04)",
    border: `1px solid rgba(${accent},0.5)`,
    boxShadow: `inset 0 0 14px rgba(${accent},0.15), 0 0 10px rgba(${accent},0.25)`,
    color: `rgb(${accent})`,
  });

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <button
        onClick={() => setRadarOpen(true)}
        className="flex w-full flex-1 items-center gap-3 rounded-xl px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-widest transition-all"
        style={btnStyle("125,211,252")}
      >
        <RadarIcon size={16} />
        Live Radar
      </button>
      <button
        onClick={() => setReportsOpen(true)}
        className="flex w-full flex-1 items-center gap-3 rounded-xl px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-widest transition-all"
        style={btnStyle("142,255,180")}
      >
        <Radio size={16} />
        Live Reports
      </button>

      <FloatingWindow
        open={radarOpen}
        onClose={() => setRadarOpen(false)}
        title="NEXRAD Radar"
        subtitle={
          radar.selectedStation
            ? `${radar.selectedStation.id} — ${radar.selectedStation.name}`
            : "Select a station on the map"
        }
        accent="125,211,252"
        width="33vw"
        height="min(80dvh, 720px)"
      >
        <div className="relative flex h-full flex-col p-2">
          <button
            onClick={() => setRadarFullOpen(true)}
            aria-label="Expand radar"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md"
            style={{
              zIndex: 1000,
              background: "rgba(10,10,14,0.9)",
              border: "1px solid rgba(125,211,252,0.55)",
              color: "rgb(125,211,252)",
              boxShadow: "0 0 10px rgba(125,211,252,0.35)",
            }}
          >
            <Maximize2 size={14} />
          </button>
          <div
            className="relative min-h-0 flex-1 overflow-hidden rounded-lg"
            style={{ background: "#1a1a2e" }}
          >
            <Suspense fallback={null}>
              <LeafletRadar
                station={radar.selectedStation}
                tileUrl={radar.tileUrl}
                interactive
                selectedStation={radar.selectedStation}
                onStationMarkerSelect={radar.selectStationByMarker}
                setSelectedProduct={radar.setSelectedProduct}
              />
            </Suspense>
          </div>
        </div>
      </FloatingWindow>

      <FloatingWindow
        open={radarFullOpen}
        onClose={() => setRadarFullOpen(false)}
        title="NEXRAD Radar — Full View"
        subtitle={
          radar.selectedStation
            ? `${radar.selectedStation.id} — ${radar.selectedStation.name}`
            : "Select a station on the map"
        }
        accent="125,211,252"
        anchor="center"
        width="min(1100px, 92vw)"
        height="min(88dvh, 900px)"
      >
        <div className="flex h-full flex-col gap-3 p-3">
          <RadarControls
            selectedCity={radar.selectedCity}
            onCityChange={radar.setSelectedCity}
            selectedStation={radar.selectedStation}
            stationDistanceKm={radar.stationDistanceKm}
            selectedProduct={radar.selectedProduct}
            onProductChange={(code) => {
              radar.setSelectedProduct(code);
              setRadarOpen(true);
            }}
          />
          <div>
            <div className="mb-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              Scan Types
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRODUCTS.map((p) => (
                <button
                  key={p.code}
                  onClick={() => {
                    radar.setSelectedProduct(p.code as ProductCode);
                    setRadarOpen(true);
                  }}
                  className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors"
                  style={{
                    background:
                      radar.selectedProduct === p.code
                        ? "rgba(125,211,252,0.15)"
                        : "rgba(255,255,255,0.04)",
                    border:
                      radar.selectedProduct === p.code
                        ? "1px solid rgba(125,211,252,0.6)"
                        : "1px solid rgba(255,255,255,0.1)",
                    color:
                      radar.selectedProduct === p.code
                        ? "hsl(190 100% 70%)"
                        : "hsl(0 0% 70%)",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="relative min-h-0 flex-1 overflow-hidden rounded-lg"
            style={{ background: "#1a1a2e" }}
          >
            <Suspense fallback={null}>
              <LeafletRadar
                station={radar.selectedStation}
                tileUrl={radar.tileUrl}
                interactive
                selectedStation={radar.selectedStation}
                onStationMarkerSelect={radar.selectStationByMarker}
                setSelectedProduct={(code) => {
                  radar.setSelectedProduct(code);
                  setRadarOpen(true);
                }}
              />
            </Suspense>
          </div>
        </div>
      </FloatingWindow>

      <FloatingWindow
        open={reportsOpen}
        onClose={() => setReportsOpen(false)}
        title="Live Weather Reports"
        subtitle="Professional stations & reporters"
        accent="142,255,180"
        width="33vw"
        height="min(80dvh, 720px)"
      >
        <div className="h-full [&_h2]:hidden">
          <IntegrationPanel />
        </div>
      </FloatingWindow>
    </div>
  );
}
