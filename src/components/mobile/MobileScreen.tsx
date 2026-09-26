/**
 * MobileScreen - full-screen overlay rendered above MobileLayout when one of
 * the floating action buttons is activated. Hosts every "secondary" surface:
 *
 *   • faq      → embedded FAQ page (mirrors /faq from desktop StatusBar)
 *   • account  → AccountCenter (auth, profile, hometown picker, settings)
 *   • chat     → CitizenReports (public chat feed + post composer)
 *   • alerts   → latest Professional Weather Reports / LSR reports (color-coded, time-sorted)
 *   • radar    → MobileRadar full-screen tactical radar with station picker
 *
 * A single floating "Return" button (bottom-right) closes the overlay and
 * returns the user to MobileMain.
 */
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import AccountCenter from "@/pages/AccountCenter";
import CitizenReports from "@/components/CitizenReports";
import FAQ from "@/pages/FAQ";
import MobileRadar from "./MobileRadar";
import MobileAlertsPanel from "./MobileAlertsPanel";
import ExerciseComfort from "@/components/ExerciseComfort";
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
        {/* FAQ - reuses the same page rendered at /faq on desktop. Extra bottom
            padding so the floating "Return" button never overlaps the last item. */}
        {screen === "faq" && (
          <div style={{ paddingBottom: "72px" }}>
            <FAQ hideBackButton />
          </div>
        )}

        {screen === "account" && <AccountCenter hideBackLink />}

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

        {/* Exercise comfort - the component IS the modal; we render it with
            open=true and route its close callback back to the screen closer.
            The floating Return button below still works as a fallback. */}
        {screen === "exercise" && <ExerciseComfort open onClose={onClose} />}
      </div>

      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label="Return"
        onClick={onClose}
        className="fixed bottom-5 right-3 z-[1100] size-11 rounded-md border-primary/50 bg-card text-primary shadow-[0_0_10px_hsl(var(--primary)/0.28)] hover:bg-secondary"
      >
        <ArrowLeft size={18} />
      </Button>
    </div>
  );
}
