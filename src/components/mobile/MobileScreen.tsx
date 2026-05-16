import { ArrowLeft } from "lucide-react";
import AccountCenter from "@/pages/AccountCenter";
import CitizenReports from "@/components/CitizenReports";
import MobileRadar from "./MobileRadar";
import { useLSR, getLSRColor, getSourceColor } from "@/hooks/useLSR";
import type { MobileScreenId } from "./MobileLayout";

interface Props {
  screen: MobileScreenId;
  onClose: () => void;
}

function formatLSRTime(valid: string): string {
  if (!valid) return "";
  const d = new Date(valid);
  if (Number.isNaN(d.getTime())) return valid;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MobileScreen({ screen, onClose }: Props) {
  const { reports: lsrReports, loading: lsrLoading } = useLSR();

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
            className="[&>aside]:w-full [&>aside]:h-full [&>aside]:border-l-0"
            style={{ position: "absolute", inset: 0, paddingBottom: "72px", display: "flex", flexDirection: "column" }}
          >
            <CitizenReports />
          </div>
        )}

        {screen === "radar" && <MobileRadar />}

        {screen === "alerts" && (
          <div style={{ padding: "12px 12px 88px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div
              style={{
                color: "#ff9d00",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                marginBottom: "4px",
              }}
            >
              Professional Weather Reports
            </div>
            {lsrLoading && lsrReports.length === 0 && (
              <div style={{ color: "#666", fontSize: "11px" }}>Loading reports…</div>
            )}
            {!lsrLoading && lsrReports.length === 0 && (
              <div style={{ color: "#666", fontSize: "11px" }}>No recent reports.</div>
            )}
            {lsrReports.map((r, i) => {
              const typeColor = getLSRColor(r.typetext);
              const srcColor = getSourceColor(r.source);
              const location = [r.city, r.state].filter(Boolean).join(", ");
              const mag =
                r.magnitude !== null && r.magnitude !== 0
                  ? `${r.magnitude}${/wind/i.test(r.typetext) ? " mph" : /hail/i.test(r.typetext) ? '"' : ""}`
                  : "";
              return (
                <div
                  key={`${r.valid}-${i}`}
                  style={{
                    borderLeft: `3px solid ${typeColor}`,
                    padding: "6px 10px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "2px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                    <span style={{ color: "#fff", fontSize: "12px", fontWeight: 600 }}>
                      {r.typetext}
                      {mag && <span style={{ color: typeColor, marginLeft: 6 }}>{mag}</span>}
                    </span>
                    <span style={{ color: "#888", fontSize: "10px", flexShrink: 0 }}>{formatLSRTime(r.valid)}</span>
                  </div>
                  <div style={{ color: "#aaa", fontSize: "10px", marginTop: "3px", lineHeight: 1.4 }}>
                    {location || r.county}
                    {r.county && location && ` (${r.county} Co.)`}
                  </div>
                  {r.source && (
                    <div
                      style={{
                        marginTop: "3px",
                        display: "inline-block",
                        fontSize: "9px",
                        padding: "1px 5px",
                        borderRadius: "2px",
                        background: "rgba(255,255,255,0.06)",
                        color: srcColor,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {r.source}
                    </div>
                  )}
                  {r.remark && (
                    <div style={{ color: "#888", fontSize: "10px", marginTop: "4px", lineHeight: 1.4 }}>{r.remark}</div>
                  )}
                </div>
              );
            })}
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
