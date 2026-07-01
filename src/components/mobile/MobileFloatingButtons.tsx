/**
 * MobileFloatingButtons — the bottom-right action row on mobile.
 *
 * Buttons (left → right):
 *   • FAQ      — opens the FAQ page overlay (mirrors the desktop StatusBar FAQ link)
 *   • Account  — opens AccountCenter (sign in / profile / hometown / settings)
 *   • Chat     — opens CitizenReports (the public chat / report feed)
 *   • Alerts   — opens the latest Professional Weather Reports / LSR report list
 *   • Radar    — opens the full-screen radar mini-map
 *
 * A trailing chevron toggles the whole row so the user can hide the buttons
 * when they obscure underlying content. The chevron itself stays visible.
 */
import { User, MessageCircle, AlertTriangle, Radio, HelpCircle, Activity } from "lucide-react";
import type { MobileScreenId } from "./MobileLayout";

interface Props {
  buttonsVisible: boolean;
  onToggle: () => void;
  onOpen: (screen: MobileScreenId) => void;
}

export default function MobileFloatingButtons({ buttonsVisible, onToggle, onOpen }: Props) {
  // Order matters — FAQ is placed first (leftmost) per spec, immediately
  // followed by Account so the help affordance sits next to the user's hub.
  // Exercise sits between Account and Chat so wellness features cluster with
  // personal (Account) rather than tactical (Radar/Alerts).
  const buttons = [
    { id: "faq" as const, icon: <HelpCircle size={18} />, color: "#ff9d00", label: "FAQ" },
    { id: "account" as const, icon: <User size={18} />, color: "#7dd3fc", label: "Account" },
    { id: "exercise" as const, icon: <Activity size={18} />, color: "#a3e635", label: "Exercise comfort" },
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
      {/* The action button group — fades out (pointer-events disabled) when hidden. */}
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

      {/* Persistent toggle chevron — always interactive so users can re-show the row. */}
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
