/**
 * MobileLayout — root container for the mobile (<1024px) experience.
 *
 * Structure (top → bottom):
 *   • MobileHeader   — fixed 10dvh strip with logo, UTC clock, online count
 *   • MobileMain     — scrollable content (welcome, hometown risk, SPC bot,
 *                       environmental metrics, WRS bar, latest chat)
 *   • Floating action buttons (bottom-right): FAQ, Account, Chat, Alerts, Radar
 *   • MobileScreen   — full-screen overlay rendered when a floating button
 *                       is activated. Hosts FAQ / AccountCenter / CitizenReports
 *                       / Professional Weather Reports list / MobileRadar.
 *
 * The CityProvider wraps everything so hooks that depend on the selected city
 * (radar, weather, sounding) work consistently with the desktop tree.
 */
import { useState } from "react";
import { CityProvider } from "@/contexts/CityContext";
import MobileHeader from "./MobileHeader";
import MobileMain from "./MobileMain";
import MobileFloatingButtons from "./MobileFloatingButtons";
import MobileScreen from "./MobileScreen";

// Identifiers for every overlay screen reachable from the floating button row.
// "faq" was added to surface the FAQ page on mobile (desktop links to /faq
// from the StatusBar — mobile has no status bar, so we use an overlay instead).
export type MobileScreenId = "faq" | "account" | "chat" | "alerts" | "radar";

export default function MobileLayout() {
  // Which overlay is currently visible (null = none, main content shown).
  const [activeScreen, setActiveScreen] = useState<MobileScreenId | null>(null);
  // Collapse/expand the floating button row to free up screen real estate.
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
        {/* Top strip — fixed height so it never collapses under content. */}
        <div style={{ height: "10dvh", flexShrink: 0 }}>
          <MobileHeader />
        </div>

        {/* Main scrollable area — overflow handled inside MobileMain. */}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <MobileMain />
        </div>

        {/* Persistent floating action buttons (bottom-right). */}
        <MobileFloatingButtons
          buttonsVisible={buttonsVisible}
          onToggle={() => setButtonsVisible((v) => !v)}
          onOpen={setActiveScreen}
        />

        {/* Full-screen overlay — only mounted when a screen is active so
            hidden screens don't run their data subscriptions. */}
        {activeScreen && (
          <MobileScreen screen={activeScreen} onClose={() => setActiveScreen(null)} />
        )}
      </div>
    </CityProvider>
  );
}
