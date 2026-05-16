import { ArrowLeft } from "lucide-react";
import AccountCenter from "@/pages/AccountCenter";
import MobileRadar from "./MobileRadar";
import { useAlerts } from "@/hooks/useAlerts";
import { getWarningColor } from "@/hooks/useWarningPolygons";
import type { MobileScreenId } from "./MobileLayout";

interface Props {
  screen: MobileScreenId;
  onClose: () => void;
}

export default function MobileScreen({ screen, onClose }: Props) {
  const { mostDangerous, recentAlerts } = useAlerts();
  const allAlerts = [...mostDangerous, ...recentAlerts];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#050505",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'JetBrains Mono', monospace",
        color: "#e8e8e8",
      }}
    >
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {screen === "account" && <AccountCenter />}

        {screen === "chat" && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
              textAlign: "center",
              color: "#888",
              fontSize: "12px",
              lineHeight: 1.6,
            }}
          >
            <div>
              <div style={{ color: "#ff9d00", fontSize: "14px", marginBottom: "8px", fontWeight: 700 }}>
                Live chat coming soon
              </div>
              Real-time community chat is in the works. Check back shortly.
            </div>
          </div>
        )}

        {screen === "radar" && (
          <div style={{ position: "absolute", inset: 0 }}>
            <RadarMiniMap
              expanded
              onCollapse={onClose}
              selectedCity={selectedCity}
              setSelectedCity={setSelectedCity}
              selectedStation={selectedStation}
              setSelectedStation={setSelectedStation}
              onStationMarkerSelect={selectStationByMarker}
              stationDistanceKm={stationDistanceKm}
              selectedProduct={selectedProduct}
              setSelectedProduct={setSelectedProduct}
              tileUrl={tileUrl}
            />
          </div>
        )}

        {screen === "alerts" && (
          <div style={{ padding: "12px 12px 88px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {allAlerts.length === 0 && (
              <div style={{ color: "#666", fontSize: "11px" }}>No active alerts.</div>
            )}
            {allAlerts.map((alert, i) => (
              <div
                key={i}
                style={{
                  borderLeft: `3px solid ${getWarningColor(alert)}`,
                  padding: "6px 10px",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "2px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                  <span style={{ color: "#fff", fontSize: "12px", fontWeight: 600 }}>{alert.event}</span>
                  <span
                    style={{
                      fontSize: "9px",
                      padding: "1px 5px",
                      borderRadius: "2px",
                      background: "rgba(255,255,255,0.08)",
                      color: "#aaa",
                      flexShrink: 0,
                    }}
                  >
                    {alert.severity}
                  </span>
                </div>
                <div style={{ color: "#888", fontSize: "10px", marginTop: "3px", lineHeight: 1.4 }}>
                  {alert.areaDesc}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        aria-label="Return"
        onClick={onClose}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "12px",
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: "rgba(10,10,14,0.9)",
          border: "1px solid rgba(255,157,0,0.4)",
          color: "#ff9d00",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 0 8px rgba(255,157,0,0.33)",
          zIndex: 1100,
        }}
      >
        <ArrowLeft size={18} />
      </button>
    </div>
  );
}
