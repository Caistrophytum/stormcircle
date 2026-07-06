/**
 * RadarReportsTab — a rounded-square radar preview (click to open full radar)
 * plus a scrolling weather-reports feed from Professional stations/reporters.
 */
import { lazy, Suspense, useState } from "react";
import { Radar, Radio } from "lucide-react";
import FloatingWindow from "@/components/desktop/FloatingWindow";
import IntegrationPanel from "@/components/IntegrationPanel";
import { PRODUCTS, type ProductCode } from "@/hooks/useRadar";
import { useRadarContext } from "@/contexts/RadarContext";
import RadarControls from "@/components/RadarControls";

const LeafletRadar = lazy(() =>
  import("@/components/RadarMiniMap").then((m) => ({ default: m.LeafletRadar })),
);

export default function RadarReportsTab() {
  const [expanded, setExpanded] = useState(false);
  const radar = useRadarContext();

  const previewSize = 128;

  return (
    <div className="flex gap-3 p-4">
      {/* Radar preview */}
      <button
        onClick={() => setExpanded(true)}
        className="group relative shrink-0 overflow-hidden rounded-2xl transition-all"
        style={{
          width: previewSize,
          height: previewSize,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(125,211,252,0.4)",
          boxShadow: "inset 0 0 12px rgba(125,211,252,0.15), 0 0 12px rgba(125,211,252,0.2)",
        }}
        title="Open radar"
      >
        <Suspense
          fallback={<div className="h-full w-full" style={{ background: "#1a1a2e" }} />}
        >
          <div className="pointer-events-none absolute inset-1 overflow-hidden rounded-xl">
            <LeafletRadar
              station={radar.selectedStation}
              tileUrl={radar.tileUrl}
              interactive={false}
              selectedStation={radar.selectedStation}
              onStationMarkerSelect={radar.selectStationByMarker}
              setSelectedProduct={radar.setSelectedProduct}
            />
          </div>
        </Suspense>
        <div className="absolute left-2 top-2 flex items-center gap-1">
          <Radar size={12} className="text-[hsl(190_100%_65%)]" />
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[hsl(190_100%_65%)]">
            Radar
          </span>
        </div>
      </button>

      {/* Reports feed */}
      <div
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2">
          <Radio size={12} className="text-primary" />
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-primary">
            Weather Reports
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden [&_h2]:hidden [&>div]:h-full">
          <IntegrationPanel />
        </div>
      </div>

      <FloatingWindow
        open={expanded}
        onClose={() => setExpanded(false)}
        title="NEXRAD Radar"
        subtitle={
          radar.selectedStation
            ? `${radar.selectedStation.id} — ${radar.selectedStation.name}`
            : "Select a station on the map"
        }
        accent="125,211,252"
        width="min(1100px, 96vw)"
        height="min(88dvh, 820px)"
      >
        <div className="flex h-full gap-3 p-3">
          <div className="flex w-[200px] shrink-0 flex-col gap-3">
            <RadarControls
              selectedCity={radar.selectedCity}
              onCityChange={radar.setSelectedCity}
              selectedStation={radar.selectedStation}
              stationDistanceKm={radar.stationDistanceKm}
              selectedProduct={radar.selectedProduct}
              onProductChange={radar.setSelectedProduct}
            />
            <div>
              <div className="mb-2 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                Scan Types
              </div>
              <div className="flex flex-col gap-1">
                {PRODUCTS.map((p) => (
                  <button
                    key={p.code}
                    onClick={() => radar.setSelectedProduct(p.code as ProductCode)}
                    className="rounded-md px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider transition-colors"
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
          </div>
          <div
            className="relative flex-1 overflow-hidden rounded-lg"
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
    </div>
  );
}
