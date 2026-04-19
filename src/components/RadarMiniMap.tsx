import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { forwardRef, useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import { Maximize2, Minimize2 } from "lucide-react";
import { RadarStation } from "@/config/radarStations";
import RadarControls from "./RadarControls";
import { ProductCode, SelectedCity } from "@/hooks/useRadar";
import { useWarningPolygons, getWarningColor } from "@/hooks/useWarningPolygons";

interface Props {
  expanded: boolean;
  onCollapse: () => void;
  selectedCity: SelectedCity | null;
  setSelectedCity: (c: SelectedCity) => void;
  selectedStation: RadarStation | null;
  stationDistanceKm: number | null;
  selectedProduct: ProductCode | null;
  setSelectedProduct: (p: ProductCode) => void;
  tileUrl: string | null;
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

  useEffect(() => {
    if (!tileUrl) return;

    const radarLayer = L.tileLayer(tileUrl, {
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
  }, [map, tileUrl, onTileRequest]);

  return null;
});

interface LeafletMapProps {
  station: RadarStation | null;
  tileUrl: string | null;
  interactive: boolean;
  onTileRequest?: (url: string) => void;
}

const LeafletRadar = ({ station, tileUrl, interactive, onTileRequest }: LeafletMapProps) => {
  const center: [number, number] = station ? [station.lat, station.lon] : DEFAULT_CENTER;
  const zoom = station ? STATION_ZOOM : DEFAULT_ZOOM;
  const { polygons } = useWarningPolygons();

  const featureCollection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: polygons.map((p) => ({
      type: "Feature",
      geometry: p.geometry,
      properties: {
        id: p.id,
        event: p.event,
        description: p.description,
        headline: p.headline,
        parameters: p.parameters,
        color: p.color,
      },
    })),
  };

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
        attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
        maxZoom={20}
      />
      <TileLayer
        url="https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/usstates/{z}/{x}/{y}.png"
        opacity={0.5}
        attribution=""
      />
      <TileLayer
        url="https://tiles.stadiamaps.com/tiles/stamen_toner_lines/{z}/{x}/{y}{r}.png"
        opacity={0.3}
        attribution=""
      />
      <RadarOverlayLayer tileUrl={tileUrl} onTileRequest={onTileRequest} />
      {polygons.length > 0 && (
        <GeoJSON
          key={polygons.map((p) => p.id).join(",")}
          data={featureCollection}
          style={(feature) => ({
            color: (feature?.properties?.color as string) ?? getWarningColor(feature?.properties),
            weight: 2,
            opacity: 1,
            fillOpacity: 0,
          })}
        />
      )}
      <TileLayer
        url="https://tiles.stadiamaps.com/tiles/stamen_toner_labels/{z}/{x}/{y}{r}.png"
        opacity={0.8}
        attribution=""
        zIndex={1000}
      />
      <Recenter station={station} />
    </MapContainer>
  );
};

const RadarMiniMap = ({
  expanded,
  onCollapse,
  selectedCity,
  setSelectedCity,
  selectedStation,
  stationDistanceKm,
  selectedProduct,
  setSelectedProduct,
  tileUrl,
}: Props) => {
  const [lastTileUrl, setLastTileUrl] = useState<string | null>(null);
  if (!expanded) {
    const circleSize = "clamp(160px, 18vw, 240px)";

    return (
      <div
        onClick={onCollapse}
        className="relative cursor-pointer group"
        style={{ width: circleSize, height: circleSize }}
      >
        <div className="absolute inset-0 rounded-full glass-panel overflow-hidden group-hover:border-primary/50 transition-colors">
          <div className="absolute inset-1 overflow-hidden" style={{ borderRadius: "50%" }}>
            <LeafletRadar station={selectedStation} tileUrl={tileUrl} interactive={false} onTileRequest={setLastTileUrl} />
          </div>
          <Maximize2 className="absolute top-2 right-2 size-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity z-[400]" />
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
          <LeafletRadar station={selectedStation} tileUrl={tileUrl} interactive onTileRequest={setLastTileUrl} />
        </div>
      </div>
    </div>
  );
};

export default RadarMiniMap;
