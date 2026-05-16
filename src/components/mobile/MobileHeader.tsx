import { useEffect, useState } from "react";
import { useOnlineCount } from "@/hooks/useOnlineCount";

export default function MobileHeader() {
  const onlineCount = useOnlineCount();
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
        borderBottom: "1px solid rgba(255,157,0,0.25)",
        background: "rgba(10,10,14,0.95)",
      }}
    >
      <div style={{ color: "#ff9d00", fontWeight: 700, fontSize: "11px", letterSpacing: "0.08em" }}>
        ⛈ STORMCIRCLE
      </div>

      <div style={{ color: "#888", fontSize: "10px", letterSpacing: "0.1em" }}>{timeLabel}</div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          color: "#00ff88",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.08em",
        }}
      >
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
        {onlineCount} ONLINE
      </div>
    </div>
  );
}
