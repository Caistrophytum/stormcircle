import { useState } from "react";
import { CityProvider } from "@/contexts/CityContext";
import MobileHeader from "./MobileHeader";
import MobileAlerts from "./MobileAlerts";
import MobileHazards from "./MobileHazards";
import MobileFloatingButtons from "./MobileFloatingButtons";
import MobileScreen from "./MobileScreen";

export type MobileScreenId = "account" | "chat" | "alerts" | "radar";

export default function MobileLayout() {
  const [activeScreen, setActiveScreen] = useState<MobileScreenId | null>(null);
  const [buttonsVisible, setButtonsVisible] = useState(true);

  return (
    <CityProvider>
    <div
      style={{
        width: "100dvw",
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#050505",
        color: "#e8e8e8",
        fontFamily: "'JetBrains Mono', monospace",
        position: "relative",
      }}
    >
      <div style={{ height: "10dvh", flexShrink: 0 }}>
        <MobileHeader />
      </div>

      <div style={{ height: "40dvh", flexShrink: 0, overflow: "hidden" }}>
        <MobileAlerts />
      </div>

      <div style={{ height: "50dvh", flexShrink: 0, overflow: "hidden" }}>
        <MobileHazards />
      </div>

      <MobileFloatingButtons
        buttonsVisible={buttonsVisible}
        onToggle={() => setButtonsVisible((v) => !v)}
        onOpen={setActiveScreen}
      />

      {activeScreen && (
        <MobileScreen screen={activeScreen} onClose={() => setActiveScreen(null)} />
      )}
    </div>
    </CityProvider>
  );
}
