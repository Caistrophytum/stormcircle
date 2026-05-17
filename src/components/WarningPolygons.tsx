import { useMap } from "react-leaflet";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import L from "leaflet";
import {
  WarningPolygon,
  getWarningTags,
  getExpiresLabel,
  getWarningColor,
} from "@/hooks/useWarningPolygons";

export interface WarningPolygonsHandle {
  flyToWarning: (eventType: string) => void;
}

interface WarningPolygonsProps {
  polygons: WarningPolygon[];
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTooltipHtml(p: WarningPolygon): string {
  const tags = getWarningTags(p);
  const expires = getExpiresLabel(p.expires);
  const color = getWarningColor(p);
  const tagPills = tags
    .map((t) => `<span class="warning-tag">${escapeHtml(t)}</span>`)
    .join("");
  return `
    <div class="warning-tooltip-inner">
      <div class="warning-tooltip-header" style="color:${color}">${escapeHtml(p.event)}</div>
      ${tags.length ? `<div class="warning-tooltip-tags">${tagPills}</div>` : ""}
      <div class="warning-tooltip-area">${escapeHtml(p.areaDesc)}</div>
      <div class="warning-tooltip-expires">${escapeHtml(expires)}</div>
    </div>
  `;
}

// Ray-casting point-in-polygon. ring is array of [lon, lat].
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(
  lon: number,
  lat: number,
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): boolean {
  if (geom.type === "Polygon") {
    const rings = geom.coordinates as number[][][];
    if (!rings.length || !pointInRing(lon, lat, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lon, lat, rings[i])) return false;
    }
    return true;
  }
  const polys = geom.coordinates as number[][][][];
  for (const rings of polys) {
    if (!rings.length) continue;
    if (!pointInRing(lon, lat, rings[0])) continue;
    let inHole = false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lon, lat, rings[i])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

function polygonCenter(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number] {
  const coords =
    geom.type === "Polygon"
      ? (geom.coordinates[0] as number[][])
      : (geom.coordinates[0][0] as number[][]);
  const lats = coords.map((c) => c[1]);
  const lons = coords.map((c) => c[0]);
  return [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lons) + Math.max(...lons)) / 2,
  ];
}

const WarningPolygons = forwardRef<WarningPolygonsHandle, WarningPolygonsProps>(
  ({ polygons }, ref) => {
    const map = useMap();
    const layersRef = useRef<Map<string, L.Polygon>>(new Map());
    const tooltipsRef = useRef<Map<string, L.Tooltip>>(new Map());
    const openTooltipsRef = useRef<Set<string>>(new Set());
    const popupOpenRef = useRef(false);
    const activePopupIdRef = useRef<string | null>(null);

    useImperativeHandle(ref, () => ({
      flyToWarning(eventType: string) {
        const match = polygons.find((p) => p.event === eventType);
        if (!match || !match.geometry) return;
        const [centerLat, centerLon] = polygonCenter(match.geometry);
        map.flyTo([centerLat, centerLon], 8, { duration: 1.2 });
        setTimeout(() => {
          const layer = layersRef.current.get(match.id);
          layer?.openPopup();
        }, 1400);
      },
    }));

    // Ensure tooltip pane sits above other overlays
    useEffect(() => {
      const pane = map.getPane("tooltipPane");
      const popupPane = map.getPane("popupPane");
      if (pane) pane.style.zIndex = "1000";
      if (popupPane) popupPane.style.zIndex = "1001";
    }, [map]);

    // (Re)build polygon layers when data changes
    useEffect(() => {
      // Clear old
      layersRef.current.forEach((l) => map.removeLayer(l));
      tooltipsRef.current.forEach((t) => {
        if (map.hasLayer(t)) map.removeLayer(t);
      });
      layersRef.current.clear();
      tooltipsRef.current.clear();
      openTooltipsRef.current.clear();
      popupOpenRef.current = false;
      activePopupIdRef.current = null;

      polygons.forEach((p) => {
        if (!p.geometry) return;
        const color = p.color ?? getWarningColor(p);
        const latlngs: L.LatLngExpression[] | L.LatLngExpression[][] =
          p.geometry.type === "Polygon"
            ? (p.geometry.coordinates as number[][][]).map((ring) =>
                ring.map(([lon, lat]) => [lat, lon] as [number, number]),
              )
            : (p.geometry.coordinates as number[][][][]).flatMap((poly) =>
                poly.map((ring) =>
                  ring.map(([lon, lat]) => [lat, lon] as [number, number]),
                ),
              );

        const layer = L.polygon(latlngs as any, {
          color,
          weight: 2,
          opacity: 1,
          fillOpacity: 0,
        }).addTo(map);

        layer.bindPopup(buildTooltipHtml(p), {
          maxWidth: 240,
          className: "warning-popup",
        });

        layer.on("popupopen", () => {
          popupOpenRef.current = true;
          activePopupIdRef.current = p.id;
          // Close all hover tooltips
          tooltipsRef.current.forEach((t, id) => {
            if (map.hasLayer(t)) map.removeLayer(t);
            openTooltipsRef.current.delete(id);
          });
        });
        layer.on("popupclose", () => {
          popupOpenRef.current = false;
          activePopupIdRef.current = null;
        });

        layersRef.current.set(p.id, layer);

        const tip = L.tooltip({
          permanent: true,
          direction: "top",
          offset: [0, -8],
          className: "warning-tooltip",
          opacity: 0.95,
          interactive: false,
        }).setContent(buildTooltipHtml(p));
        tooltipsRef.current.set(p.id, tip);
      });

      return () => {
        layersRef.current.forEach((l) => map.removeLayer(l));
        tooltipsRef.current.forEach((t) => {
          if (map.hasLayer(t)) map.removeLayer(t);
        });
        layersRef.current.clear();
        tooltipsRef.current.clear();
        openTooltipsRef.current.clear();
      };
    }, [polygons, map]);

    // Hover handling: show tooltips for every polygon under the cursor
    useEffect(() => {
      const onMove = (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        const hits = new Set<string>();
        if (!popupOpenRef.current) {
          polygons.forEach((p) => {
            if (p.geometry && pointInPolygon(lng, lat, p.geometry)) {
              hits.add(p.id);
            }
          });
        }
        // Close tooltips no longer hovered
        openTooltipsRef.current.forEach((id) => {
          if (!hits.has(id)) {
            const t = tooltipsRef.current.get(id);
            if (t && map.hasLayer(t)) map.removeLayer(t);
            openTooltipsRef.current.delete(id);
          }
        });
        // Open/move tooltips for current hits, stacking them vertically
        let offsetY = -8;
        hits.forEach((id) => {
          const t = tooltipsRef.current.get(id);
          if (!t) return;
          t.setLatLng(e.latlng);
          (t.options as any).offset = [0, offsetY];
          if (!map.hasLayer(t)) {
            t.addTo(map);
          } else {
            // Force reposition with new offset
            t.setLatLng(e.latlng);
          }
          openTooltipsRef.current.add(id);
          offsetY -= 8;
        });
      };

      const onOut = () => {
        openTooltipsRef.current.forEach((id) => {
          const t = tooltipsRef.current.get(id);
          if (t && map.hasLayer(t)) map.removeLayer(t);
        });
        openTooltipsRef.current.clear();
      };

      map.on("mousemove", onMove);
      map.on("mouseout", onOut);
      return () => {
        map.off("mousemove", onMove);
        map.off("mouseout", onOut);
      };
    }, [polygons, map]);

    return null;
  },
);

WarningPolygons.displayName = "WarningPolygons";

export default WarningPolygons;
