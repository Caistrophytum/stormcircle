import { User, MessageCircle, AlertTriangle, Radio } from "lucide-react";
import type { MobileScreenId } from "./MobileLayout";

interface Props {
  buttonsVisible: boolean;
  onToggle: () => void;
  onOpen: (screen: MobileScreenId) => void;
}

export default function MobileFloatingButtons({ buttonsVisible, onToggle, onOpen }: Props) {
  const buttons = [
    { id: "account" as const, icon: <User size={18} />, color: "#7dd3fc", label: "Account" },
    { id: "chat" as const, icon: <MessageCircle size={18} />, color: "#00ff88", label: "Chat" },
    { id: "alerts" as const, icon: <AlertTriangle size={18} />, color: "#ff9d00", label: "All alerts" },
    { id: "radar" as const, icon: <Radio size={18} />, color: "#ff6b6b", label: "Radar" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "12px",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "10px",
        zIndex: 500,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "10px",
          opacity: buttonsVisible ? 1 : 0,
          pointerEvents: buttonsVisible ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      >
        {buttons.map((btn) => (
          <button
            key={btn.id}
            aria-label={btn.label}
            onClick={() => onOpen(btn.id)}
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "rgba(10,10,14,0.9)",
              border: `1px solid ${btn.color}66`,
              color: btn.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: `0 0 8px ${btn.color}33`,
              flexShrink: 0,
            }}
          >
            {btn.icon}
          </button>
        ))}
      </div>

      <button
        aria-label={buttonsVisible ? "Hide actions" : "Show actions"}
        onClick={onToggle}
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: "rgba(10,10,14,0.85)",
          border: "1px solid rgba(255,157,0,0.4)",
          color: "#ff9d00",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          opacity: buttonsVisible ? 1 : 0.5,
          transition: "opacity 0.25s ease",
          fontSize: "16px",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {buttonsVisible ? "›" : "‹"}
      </button>
    </div>
  );
}
