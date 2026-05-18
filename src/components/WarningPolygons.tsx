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

/** Once-per-load detection of touch-only (no hover) devices. On these we
 *  skip the permanent-tooltip construction and the mousemove hit-tester
 *  entirely — they're hover-only behaviour that touch users can't trigger,
 *  and they're the main reason WarningPolygons is slow on phones. */
const IS_TOUCH_ONLY =
  typeof window !== "undefined" &&
  "ontouchstart" in window &&
  !(window.matchMedia?.("(hover: hover)").matches ?? false);

/** Dedicated Leaflet pane for warning polygons. Sits above the radar tile
 *  pane (zIndex 650) so polygons are never occluded by radar imagery, and
 *  hosts a canvas renderer so all polygons paint as one canvas op. */
const WARNINGS_PANE = "warnings-pane";
const WARNINGS_PANE_Z = 655;

const WarningPolygons = forwardRef<WarningPolygonsHandle, WarningPolygonsProps>(
  ({ polygons }, ref) => {
    const map = useMap();
    const layersRef = useRef<Map<string, L.Polygon>>(new Map());
    const tooltipsRef = useRef<Map<string, L.Tooltip>>(new Map());
    const openTooltipsRef = useRef<Set<string>>(new Set());
    const popupOpenRef = useRef(false);
    const activePopupIdRef = useRef<string | null>(null);
    const rendererRef = useRef<L.Canvas | null>(null);
    // Keep latest polygons accessible to event handlers without re-binding.
    const polygonsRef = useRef<WarningPolygon[]>(polygons);
    useEffect(() => { polygonsRef.current = polygons; }, [polygons]);

    useImperativeHandle(ref, () => ({
      flyToWarning(eventType: string) {
        const match = polygonsRef.current.find((p) => p.event === eventType);
        if (!match || !match.geometry) return;
        const [centerLat, centerLon] = polygonCenter(match.geometry);
        map.flyTo([centerLat, centerLon], 8, { duration: 1.2 });
        setTimeout(() => {
          const [cLat, cLon] = [centerLat, centerLon];
          const hits = polygonsRef.current.filter(
            (q) => q.geometry && pointInPolygon(cLon, cLat, q.geometry),
          );
          const list = hits.length ? hits : [match];
          const html = `<div class="warning-popup-stack">${list
            .map((q) => buildTooltipHtml(q))
            .join('<div class="warning-popup-sep"></div>')}</div>`;
          L.popup({ maxWidth: 280, className: "warning-popup" })
            .setLatLng([cLat, cLon])
            .setContent(html)
            .openOn(map);
        }, 1400);
      },
    }));

    // Set up the dedicated warnings pane + canvas renderer once per map,
    // plus tooltip/popup pane stacking and popupopen/close bookkeeping.
    useEffect(() => {
      if (!map.getPane(WARNINGS_PANE)) {
        const pane = map.createPane(WARNINGS_PANE);
        pane.style.zIndex = String(WARNINGS_PANE_Z);
        pane.style.pointerEvents = "auto";
      }
      if (!rendererRef.current) {
        rendererRef.current = L.canvas({ pane: WARNINGS_PANE, padding: 0.5 });
      }

      const tooltipPane = map.getPane("tooltipPane");
      const popupPane = map.getPane("popupPane");
      if (tooltipPane) tooltipPane.style.zIndex = "1000";
      if (popupPane) popupPane.style.zIndex = "1001";

      const onOpen = () => {
        popupOpenRef.current = true;
        tooltipsRef.current.forEach((t, id) => {
          if (map.hasLayer(t)) map.removeLayer(t);
          openTooltipsRef.current.delete(id);
        });
      };
      const onClose = () => {
        popupOpenRef.current = false;
        activePopupIdRef.current = null;
      };
      map.on("popupopen", onOpen);
      map.on("popupclose", onClose);
      return () => {
        map.off("popupopen", onOpen);
        map.off("popupclose", onClose);
      };
    }, [map]);

    // Diff polygons by id: add new layers, drop stale ones, leave matching
    // ids untouched. Previously this effect tore down and rebuilt every
    // layer + tooltip on each refresh, which made the map visibly "blink"
    // and stressed mobile GPUs.
    useEffect(() => {
      const nextIds = new Set(polygons.map((p) => p.id));

      // Remove layers/tooltips that are no longer present.
      layersRef.current.forEach((layer, id) => {
        if (!nextIds.has(id)) {
          map.removeLayer(layer);
          layersRef.current.delete(id);
        }
      });
      tooltipsRef.current.forEach((tip, id) => {
        if (!nextIds.has(id)) {
          if (map.hasLayer(tip)) map.removeLayer(tip);
          tooltipsRef.current.delete(id);
          openTooltipsRef.current.delete(id);
        }
      });

      // Add layers for ids we don't yet have.
      polygons.forEach((p) => {
        if (!p.geometry) return;
        if (layersRef.current.has(p.id)) return;

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
          pane: WARNINGS_PANE,
          renderer: rendererRef.current ?? undefined,
        }).addTo(map);

        // Click: open a combined popup containing every polygon at that point
        // so overlapping/intersecting warnings are all visible at once.
        layer.on("click", (e: L.LeafletMouseEvent) => {
          const { lat, lng } = e.latlng;
          const hits = polygonsRef.current.filter(
            (q) => q.geometry && pointInPolygon(lng, lat, q.geometry),
          );
          const list = hits.length ? hits : [p];
          const html = `<div class="warning-popup-stack">${list
            .map((q) => buildTooltipHtml(q))
            .join('<div class="warning-popup-sep"></div>')}</div>`;
          L.popup({
            maxWidth: 280,
            className: "warning-popup",
            autoClose: true,
            closeOnClick: true,
          })
            .setLatLng(e.latlng)
            .setContent(html)
            .openOn(map);
          L.DomEvent.stopPropagation(e);
        });

        layersRef.current.set(p.id, layer);

        // Permanent tooltips drive the hover stack. Touch-only devices
        // can't hover, so don't build them there.
        if (!IS_TOUCH_ONLY) {
          const tip = L.tooltip({
            permanent: true,
            direction: "top",
            offset: [0, -8],
            className: "warning-tooltip",
            opacity: 0.95,
            interactive: false,
          }).setContent(buildTooltipHtml(p));
          tooltipsRef.current.set(p.id, tip);
        }
      });
    }, [polygons, map]);

    // Cleanup-on-unmount: drop every layer + tooltip we own.
    useEffect(() => {
      return () => {
        layersRef.current.forEach((l) => map.removeLayer(l));
        tooltipsRef.current.forEach((t) => {
          if (map.hasLayer(t)) map.removeLayer(t);
        });
        layersRef.current.clear();
        tooltipsRef.current.clear();
        openTooltipsRef.current.clear();
      };
    }, [map]);

    // Hover handling: show tooltips for every polygon under the cursor.
    // Skipped entirely on touch-only devices.
    useEffect(() => {
      if (IS_TOUCH_ONLY) return;

      const onMove = (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        const hits = new Set<string>();
        if (!popupOpenRef.current) {
          polygonsRef.current.forEach((p) => {
            if (p.geometry && pointInPolygon(lng, lat, p.geometry)) {
              hits.add(p.id);
            }
          });
        }
        openTooltipsRef.current.forEach((id) => {
          if (!hits.has(id)) {
            const t = tooltipsRef.current.get(id);
            if (t && map.hasLayer(t)) map.removeLayer(t);
            openTooltipsRef.current.delete(id);
          }
        });
        let offsetY = -8;
        hits.forEach((id) => {
          const t = tooltipsRef.current.get(id);
          if (!t) return;
          t.setLatLng(e.latlng);
          (t.options as any).offset = [0, offsetY];
          if (!map.hasLayer(t)) {
            t.addTo(map);
          } else {
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
    }, [map]);

    return null;
  },
);

WarningPolygons.displayName = "WarningPolygons";

export default WarningPolygons;
