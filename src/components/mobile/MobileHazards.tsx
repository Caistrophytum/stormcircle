import { useAlerts } from "@/hooks/useAlerts";

export default function MobileHazards() {
  const { topHazards, recentAlerts } = useAlerts();

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderTop: "1px solid rgba(255,157,0,0.25)",
      }}
    >
      <div
        style={{
          height: "50%",
          overflowY: "auto",
          padding: "8px 10px",
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
          10 MOST COMMON
        </div>
        {topHazards.length === 0 && (
          <div style={{ color: "#666", fontSize: "10px" }}>—</div>
        )}
        {topHazards.slice(0, 10).map((h) => (
          <div
            key={h.event}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "3px 0",
              borderBottom: "1px dashed rgba(255,255,255,0.05)",
              fontSize: "10px",
            }}
          >
            <span style={{ color: "#ddd" }}>{h.event}</span>
            <span
              style={{
                color: "#ff9d00",
                fontWeight: 700,
                background: "rgba(255,157,0,0.1)",
                padding: "1px 6px",
                borderRadius: "2px",
                fontSize: "9px",
              }}
            >
              {h.count}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          height: "50%",
          overflowY: "auto",
          padding: "8px 10px",
          borderTop: "1px solid rgba(255,157,0,0.15)",
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
          NEW ALERTS
        </div>
        {recentAlerts.length === 0 && (
          <div style={{ color: "#666", fontSize: "10px" }}>No new alerts.</div>
        )}
        {recentAlerts.slice(0, 5).map((alert, i) => (
          <div key={i} style={{ padding: "3px 0", borderBottom: "1px dashed rgba(255,255,255,0.05)" }}>
            <div style={{ color: "#fff", fontSize: "10px", fontWeight: 600 }}>{alert.event}</div>
            <div style={{ color: "#888", fontSize: "9px", lineHeight: 1.3 }}>{alert.areaDesc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
