import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { forwardRef, MutableRefObject, useEffect, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { Maximize2, Minimize2, Plus, Minus } from "lucide-react";
import { RadarStation, RADAR_STATIONS } from "@/config/radarStations";
import RadarControls from "./RadarControls";
import { ProductCode, SelectedCity } from "@/hooks/useRadar";
import { useWarningPolygons } from "@/hooks/useWarningPolygons";
import WarningPolygons, { WarningPolygonsHandle } from "./WarningPolygons";

interface Props {
  expanded: boolean;
  onCollapse: () => void;
  selectedCity: SelectedCity | null;
  setSelectedCity: (c: SelectedCity) => void;
  selectedStation: RadarStation | null;
  setSelectedStation: (s: RadarStation) => void;
  onStationMarkerSelect: (s: RadarStation) => void;
  stationDistanceKm: number | null;
  selectedProduct: ProductCode | null;
  setSelectedProduct: (p: ProductCode) => void;
  tileUrl: string | null;
  warningsRef?: MutableRefObject<WarningPolygonsHandle | null>;
  /** Optional pixel diameter override for the collapsed circle. */
  circleSizePx?: number | null;
}

const DEFAULT_CENTER: [number, number] = [39.5, -98.35];
const DEFAULT_ZOOM = 4;
const STATION_ZOOM = 8;

const Recenter = forwardRef<unknown, { station: RadarStation | null }>(function Recenter(
  { station },
  _ref,
) {
  const map = useMap();

  useEffect(() => {
    if (station) {
      map.setView([station.lat, station.lon], STATION_ZOOM);
    }
  }, [station, map]);

  return null;
});

interface RadarOverlayLayerProps {
  tileUrl: string | null;
  onTileRequest?: (url: string) => void;
}

const RadarOverlayLayer = forwardRef<unknown, RadarOverlayLayerProps>(function RadarOverlayLayer(
  { tileUrl, onTileRequest },
  _ref,
) {
  const map = useMap();
  const [cacheBust, setCacheBust] = useState(0);

  // Refresh radar tiles every 60s, matching weather/sounding/warnings cadence.
  useEffect(() => {
    if (!tileUrl) return;
    const id = setInterval(() => setCacheBust((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [tileUrl]);

  useEffect(() => {
    if (!tileUrl) return;

    const bustedUrl = tileUrl + (tileUrl.includes("?") ? "&" : "?") + "_t=" + cacheBust;

    const radarLayer = L.tileLayer(bustedUrl, {
      opacity: 0.7,
      tms: false,
      detectRetina: false,
      minZoom: 1,
      maxZoom: 20,
      zIndex: 650,
      attribution: "IEM NEXRAD / Iowa State",
    });

    radarLayer.on("tileloadstart", (e: L.TileEvent) => {
      const src = (e.tile as HTMLImageElement).src;
      console.log("[Radar] tile request:", src);
      onTileRequest?.(src);
    });
    radarLayer.on("tileerror", (e: L.TileErrorEvent) => {
      console.error("[Radar] tile error:", (e.tile as HTMLImageElement).src);
    });

    radarLayer.addTo(map);
    radarLayer.bringToFront();

    return () => {
      map.removeLayer(radarLayer);
    };
  }, [map, tileUrl, cacheBust, onTileRequest]);

  return null;
});

interface RadarStationMarkersProps {
  selectedStation: RadarStation | null;
  onStationSelect: (station: RadarStation) => void;
  onProductSelect: (product: ProductCode) => void;
}

const RadarStationMarkers = ({
  selectedStation,
  onStationSelect,
  onProductSelect,
}: RadarStationMarkersProps) => {
  return (
    <>
      {RADAR_STATIONS.map((station) => {
        const isSelected = selectedStation?.id === station.id;
        return (
          <CircleMarker
            key={station.id}
            center={[station.lat, station.lon]}
            radius={isSelected ? 8 : 5}
            pathOptions={{
              color: isSelected ? "#00ffff" : "#4af",
              fillColor: isSelected ? "#00ffff" : "#1a6aaa",
              fillOpacity: isSelected ? 0.9 : 0.6,
              weight: isSelected ? 2 : 1,
            }}
            eventHandlers={{
              click: () => {
                onStationSelect(station);
                onProductSelect("N0B");
              },
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -6]} className="radar-station-label">
              {station.id}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
};

interface LeafletMapProps {
  station: RadarStation | null;
  tileUrl: string | null;
  interactive: boolean;
  onTileRequest?: (url: string) => void;
  warningsRef?: MutableRefObject<WarningPolygonsHandle | null>;
  selectedStation: RadarStation | null;
  onStationMarkerSelect: (s: RadarStation) => void;
  setSelectedProduct: (p: ProductCode) => void;
  onMap?: (m: L.Map) => void;
}

const MapRefCapture = ({ onMap }: { onMap: (m: L.Map) => void }) => {
  const map = useMap();
  useEffect(() => {
    onMap(map);
  }, [map, onMap]);
  return null;
};

const LeafletRadar = ({
  station,
  tileUrl,
  interactive,
  onTileRequest,
  warningsRef,
  selectedStation,
  onStationMarkerSelect,
  setSelectedProduct,
  onMap,
}: LeafletMapProps) => {
  const center: [number, number] = station ? [station.lat, station.lon] : DEFAULT_CENTER;
  const zoom = station ? STATION_ZOOM : DEFAULT_ZOOM;
  const { polygons } = useWarningPolygons();

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="w-full h-full"
      zoomControl={false}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      boxZoom={interactive}
      keyboard={interactive}
      attributionControl={interactive}
      style={{ background: "#1a1a2e" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <TileLayer
        url="https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/usstates/{z}/{x}/{y}.png"
        opacity={0.6}
        attribution=""
      />
      <RadarStationMarkers
        selectedStation={selectedStation}
        onStationSelect={onStationMarkerSelect}
        onProductSelect={setSelectedProduct}
      />
      <RadarOverlayLayer tileUrl={tileUrl} onTileRequest={onTileRequest} />
      <WarningPolygons ref={warningsRef} polygons={polygons} />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        opacity={0.9}
        attribution=""
        zIndex={1000}
      />
      <Recenter station={station} />
      {onMap && <MapRefCapture onMap={onMap} />}
    </MapContainer>
  );
};

const RadarMiniMap = ({
  expanded,
  onCollapse,
  selectedCity,
  setSelectedCity,
  selectedStation,
  setSelectedStation,
  onStationMarkerSelect,
  stationDistanceKm,
  selectedProduct,
  setSelectedProduct,
  tileUrl,
  warningsRef,
  circleSizePx,
}: Props) => {
  const [lastTileUrl, setLastTileUrl] = useState<string | null>(null);
  const [miniMap, setMiniMap] = useState<L.Map | null>(null);
  if (!expanded) {
    const circleSize =
      circleSizePx != null && circleSizePx > 0
        ? `${circleSizePx}px`
        : "clamp(160px, 18vw, 240px)";

    const stopClick = (e: React.MouseEvent) => {
      e.stopPropagation();
    };
    return (
      <div
        className="relative"
        style={{ width: circleSize, height: circleSize }}
      >
        <div
          onClick={onCollapse}
          className="absolute inset-0 rounded-full glass-panel overflow-hidden cursor-pointer group hover:border-primary/50 transition-colors"
        >
          <div className="absolute inset-1 overflow-hidden" style={{ borderRadius: "50%" }}>
            <LeafletRadar
              station={selectedStation}
              tileUrl={tileUrl}
              interactive={false}
              onTileRequest={setLastTileUrl}
              selectedStation={selectedStation}
              onStationMarkerSelect={onStationMarkerSelect}
              setSelectedProduct={setSelectedProduct}
              onMap={(m) => setMiniMap(m)}
            />
          </div>
          <Maximize2 className="absolute top-2 left-2 size-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity z-[400]" />
        </div>

        {/* External zoom buttons above the mini-map */}
        <div
          className="absolute flex flex-row gap-2 z-[500]"
          style={{ top: "-18px", right: "-30px" }}
          onClick={stopClick}
        >
          <button
            onClick={(e) => {
              stopClick(e);
              miniMap?.zoomIn();
            }}
            className="size-8 rounded-full glass-panel flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors shadow-lg"
            aria-label="Zoom in"
          >
            <Plus className="size-4 text-primary" strokeWidth={2.5} />
          </button>
          <button
            onClick={(e) => {
              stopClick(e);
              miniMap?.zoomOut();
            }}
            className="size-8 rounded-full glass-panel flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors shadow-lg"
            aria-label="Zoom out"
          >
            <Minus className="size-4 text-primary" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3" style={{ height: "min(65vw, 620px)" }}>
      <div className="w-[220px] shrink-0 glass-panel p-3 flex flex-col gap-3">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Radar Controls</span>
        <RadarControls
          selectedCity={selectedCity}
          onCityChange={setSelectedCity}
          selectedStation={selectedStation}
          stationDistanceKm={stationDistanceKm}
          selectedProduct={selectedProduct}
          onProductChange={setSelectedProduct}
        />
      </div>

      <div className="glass-panel p-4 flex flex-col" style={{ width: "min(65vw, 620px)", height: "100%" }}>
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-mono text-muted-foreground uppercase tracking-wider">NEXRAD</span>
            {selectedStation && (
              <span className="text-[11px] font-mono text-primary/80 bg-primary/10 px-2 py-0.5 rounded-sm">
                {selectedStation.id} — {selectedStation.name}
              </span>
            )}
          </div>
          <button onClick={onCollapse} className="glass-panel p-1 hover:border-primary/50 transition-colors">
            <Minimize2 className="size-4 text-primary" />
          </button>
        </div>

        <div className="flex-1 relative bg-background/60 rounded-sm overflow-hidden">
          <LeafletRadar station={selectedStation} tileUrl={tileUrl} interactive onTileRequest={setLastTileUrl} warningsRef={warningsRef} selectedStation={selectedStation} onStationMarkerSelect={onStationMarkerSelect} setSelectedProduct={setSelectedProduct} />
        </div>
      </div>
    </div>
  );
};

export default RadarMiniMap;
