/**
 * MobileScreen — full-screen overlay rendered above MobileLayout when one of
 * the floating action buttons is activated. Hosts every "secondary" surface:
 *
 *   • faq      → embedded FAQ page (mirrors /faq from desktop StatusBar)
 *   • account  → AccountCenter (auth, profile, hometown picker, settings)
 *   • chat     → CitizenReports (public chat feed + post composer)
 *   • alerts   → latest SKYWARN / LSR reports (color-coded, time-sorted)
 *   • radar    → MobileRadar full-screen tactical radar with station picker
 *
 * A single floating "Return" button (bottom-right) closes the overlay and
 * returns the user to MobileMain.
 */
import { ArrowLeft } from "lucide-react";
import AccountCenter from "@/pages/AccountCenter";
import CitizenReports from "@/components/CitizenReports";
import FAQ from "@/pages/FAQ";
import MobileRadar from "./MobileRadar";
import MobileAlertsPanel from "./MobileAlertsPanel";
import type { MobileScreenId } from "./MobileLayout";

interface Props {
  screen: MobileScreenId;
  onClose: () => void;
}

export default function MobileScreen({ screen, onClose }: Props) {

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
        {/* FAQ — reuses the same page rendered at /faq on desktop. Extra bottom
            padding so the floating "Return" button never overlaps the last item. */}
        {screen === "faq" && (
          <div style={{ paddingBottom: "72px" }}>
            <FAQ />
          </div>
        )}

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

        {screen === "alerts" && <MobileAlertsPanel />}
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
