import { useState } from "react";
import { CityProvider } from "@/contexts/CityContext";
import MobileHeader from "./MobileHeader";
import MobileMain from "./MobileMain";
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

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <MobileMain />
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
