import { GeoJSON, useMap } from "react-leaflet";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { GeoJSON as LeafletGeoJSON } from "leaflet";
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

function buildTooltipHtml(p: any): string {
  const tags = getWarningTags(p);
  const expires = getExpiresLabel(p.expires);
  const color = getWarningColor(p);
  const tagPills = tags
    .map(
      (t) =>
        `<span class="warning-tag">${escapeHtml(t)}</span>`,
    )
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

const WarningPolygons = forwardRef<WarningPolygonsHandle, WarningPolygonsProps>(
  ({ polygons }, ref) => {
    const map = useMap();
    const geoJsonRef = useRef<LeafletGeoJSON | null>(null);

    useImperativeHandle(ref, () => ({
      flyToWarning(eventType: string) {
        const match = polygons.find((p) => p.event === eventType);
        if (!match || !match.geometry) return;

        const coords =
          match.geometry.type === "Polygon"
            ? (match.geometry.coordinates[0] as number[][])
            : (match.geometry.coordinates[0][0] as number[][]);
        const lats = coords.map((c) => c[1]);
        const lons = coords.map((c) => c[0]);
        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;

        map.flyTo([centerLat, centerLon], 8, { duration: 1.2 });

        setTimeout(() => {
          geoJsonRef.current?.eachLayer((layer: any) => {
            if (layer.feature?.properties?.id === match.id) {
              layer.openPopup();
            }
          });
        }, 1400);
      },
    }));

    if (polygons.length === 0) return null;

    const featureCollection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: polygons.map((p) => ({
        type: "Feature",
        geometry: p.geometry,
        properties: {
          id: p.id,
          event: p.event,
          areaDesc: p.areaDesc,
          expires: p.expires,
          description: p.description,
          headline: p.headline,
          severity: p.severity,
          certainty: p.certainty,
          urgency: p.urgency,
          parameters: p.parameters,
          color: p.color,
        },
      })),
    };

    return (
      <GeoJSON
        ref={geoJsonRef as any}
        key={polygons.map((p) => p.id).join(",")}
        data={featureCollection}
        style={(feature) => ({
          color:
            (feature?.properties?.color as string) ??
            getWarningColor(feature?.properties),
          weight: 2,
          opacity: 1,
          fillOpacity: 0,
        })}
        onEachFeature={(feature, layer) => {
          const p = feature.properties;
          const html = buildTooltipHtml(p);

          layer.bindTooltip(html, {
            sticky: true,
            opacity: 0.95,
            className: "warning-tooltip",
          });

          layer.bindPopup(html, {
            maxWidth: 240,
            className: "warning-popup",
          });

          layer.on("mouseover", () => {
            (layer as any).setStyle({ weight: 3, fillOpacity: 0.15 });
          });
          layer.on("mouseout", () => {
            (layer as any).setStyle({ weight: 2, fillOpacity: 0 });
          });
        }}
      />
    );
  },
);

WarningPolygons.displayName = "WarningPolygons";

export default WarningPolygons;
