import { useEffect, useState } from "react";
import { useOnlineCount } from "@/hooks/useOnlineCount";
import { useLifetimeVisitors } from "@/hooks/useLifetimeVisitors";
import { useUnitSystem, toggleUnitSystem } from "@/hooks/useUnitSystem";
import NotificationBell from "@/components/NotificationBell";

export default function MobileHeader() {
  const onlineCount = useOnlineCount();
  const lifetime = useLifetimeVisitors();
  const [showLifetime, setShowLifetime] = useState(false);
  const unitSystem = useUnitSystem();
  const [now, setNow] = useState(() => new Date());


  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeLabel = now.toUTCString().slice(17, 25) + " UTC";

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        gap: "8px",
        borderBottom: "1px solid rgba(255,157,0,0.25)",
        background: "rgba(10,10,14,0.95)",
      }}
    >
      <div
        style={{
          color: "#ff9d00",
          fontWeight: 700,
          fontSize: "11px",
          letterSpacing: "0.08em",
          whiteSpace: "nowrap",
        }}
      >
        ⛈ STORMCIRCLE
      </div>

      <button
        type="button"
        onClick={toggleUnitSystem}
        aria-label="Toggle metric / imperial units"
        title={`Switch to ${unitSystem === "metric" ? "imperial" : "metric"}`}
        style={{
          background: "rgba(0,180,255,0.08)",
          border: "1px solid rgba(0,180,255,0.35)",
          color: "#00b4ff",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.1em",
          padding: "3px 8px",
          borderRadius: "2px",
          cursor: "pointer",
          textTransform: "uppercase",
        }}
      >
        {unitSystem === "metric" ? "SI" : "US"}
      </button>

      <div style={{ color: "#888", fontSize: "10px", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
        {timeLabel}
      </div>

      <button
        type="button"
        onClick={() => setShowLifetime((v) => !v)}
        aria-label={showLifetime ? "Show live online count" : "Show lifetime visitors"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          color: showLifetime ? "#00b4ff" : "#00ff88",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          whiteSpace: "nowrap",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        {!showLifetime && (
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "#00ff88",
              display: "inline-block",
              boxShadow: "0 0 6px #00ff88",
            }}
          />
        )}
        {showLifetime
          ? `${lifetime != null ? lifetime.toLocaleString() : "..."} ALL TIME`
          : `${onlineCount} ONLINE`}
      </button>


      <NotificationBell compact />
    </div>
  );
}
