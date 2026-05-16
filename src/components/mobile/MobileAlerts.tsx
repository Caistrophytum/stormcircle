import { useAlerts } from "@/hooks/useAlerts";
import { getWarningColor } from "@/hooks/useWarningPolygons";

export default function MobileAlerts() {
  const { mostDangerous, loading } = useAlerts();

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "8px 10px 10px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,157,0,0.3) transparent",
      }}
    >
      <div
        style={{
          color: "#ff9d00",
          fontSize: "9px",
          fontWeight: 700,
          letterSpacing: "0.15em",
          marginBottom: "4px",
        }}
      >
        TOP 10 MOST DANGEROUS
      </div>

      {!loading && mostDangerous.length === 0 && (
        <div style={{ color: "#666", fontSize: "10px" }}>No active alerts.</div>
      )}

      {mostDangerous.map((alert, i) => (
        <div
          key={`${alert.event}-${i}`}
          style={{
            borderLeft: `3px solid ${getWarningColor(alert)}`,
            padding: "4px 8px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: "2px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "#fff", fontSize: "11px", fontWeight: 600 }}>{alert.event}</span>
            <span
              style={{
                fontSize: "8px",
                padding: "1px 4px",
                borderRadius: "2px",
                background: "rgba(255,255,255,0.08)",
                color: "#aaa",
                flexShrink: 0,
              }}
            >
              {alert.severity}
            </span>
          </div>
          <div style={{ color: "#888", fontSize: "9px", marginTop: "2px", lineHeight: 1.3 }}>
            {alert.areaDesc}
          </div>
        </div>
      ))}
    </div>
  );
}
