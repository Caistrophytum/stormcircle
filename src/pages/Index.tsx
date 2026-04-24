/**
 * Index.tsx — the main "tactical map" page.
 *
 * Layout:
 *   ┌──────────────── StatusBar ─────────────────┐
 *   │ [Integrations] │  TacticalMap  │ [PeerReview] │
 *   └─────────────────────────────────────────────┘
 *
 * The left and right side panels can be collapsed/expanded with the
 * buttons in the bottom-right of the map. When a panel collapses, the
 * map gets the extra width — and the floating overlays at the top of the
 * map (radar mini-map + EventInfoPanel) get scaled down so they always
 * fit inside the available center column.
 *
 * The page also derives `userRole` from the auth state, which the peer
 * review panel uses to gate moderation buttons (only "meteorologist"
 * users can verify or remove reports).
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import StatusBar from "@/components/StatusBar";
import TacticalMap from "@/components/TacticalMap";
import CitizenReports from "@/components/CitizenReports";
import IntegrationPanel from "@/components/IntegrationPanel";
import { CityProvider } from "@/contexts/CityContext";
import { useNewReportPing } from "@/hooks/useNewReportPing";


const Index = () => {
  // Side-panel open/close state.
  const [rightOpen, setRightOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(false);

  // Glow the left menu button for ~2s whenever a new SKYWARN report arrives.
  const reportPing = useNewReportPing();
  const [leftGlow, setLeftGlow] = useState(false);
  useEffect(() => {
    if (reportPing === 0) return;
    setLeftGlow(true);
    const t = setTimeout(() => setLeftGlow(false), 2000);
    return () => clearTimeout(t);
  }, [reportPing]);

  // Track viewport width so we can recompute the overlay scale on resize.
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1920
  );

  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Width available to the map (center column) given which side panels are open.
  const sidePanelWidth = 320;
  const centerWidth = Math.max(
    320,
    viewportW - (leftOpen ? sidePanelWidth : 0) - (rightOpen ? sidePanelWidth : 0)
  );

  // Intrinsic combined width of the top overlays (radar mini-map + EventInfoPanel).
  // 500 = EventInfoPanel intrinsic width, 48 = side padding + gap buffer.
  const radarPanelW = Math.min(340, Math.max(200, viewportW * 0.22));
  const topOverlayIntrinsic = radarPanelW + 500 + 48;

  // Scale so the top overlays always fit within the available center width.
  // Clamped to [0.6, 1] — never grow above natural size, never shrink below 60%.
  const overlayScale = Math.min(1, Math.max(0.6, centerWidth / topOverlayIntrinsic));

  return (
    <CityProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      <main className="flex-1 flex flex-col min-w-0">
        <StatusBar />

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Integration panel */}
          <AnimatePresence>
            {leftOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="shrink-0 overflow-hidden h-full border-r border-border bg-cockpit"
              >
                <IntegrationPanel />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Center: map */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            <TacticalMap overlayScale={overlayScale} />

            {/* Panel toggle buttons - bottom-right */}
            <div
              className="absolute bottom-4 right-4 z-30 origin-bottom-right"
              style={{ transform: `scale(${overlayScale})` }}
            >
              <div className="flex gap-2">
                <button
                  onClick={() => setLeftOpen(!leftOpen)}
                  className={`px-4 h-[50px] glass-panel hover:border-primary/50 transition-all flex flex-col justify-center items-center gap-0.5 min-w-[75px] ${
                    leftGlow ? "report-glow" : ""
                  }`}
                  title={leftOpen ? "Collapse left panel" : "Expand left panel"}
                >
                  {leftOpen
                    ? <PanelLeftClose className="size-4 text-primary" />
                    : <PanelLeftOpen className="size-4 text-primary" />}
                  <span className="text-[9px] font-mono text-muted-foreground">{leftOpen ? "HIDE" : "SHOW"}</span>
                </button>
                <button
                  onClick={() => setRightOpen(!rightOpen)}
                  className="px-4 h-[50px] glass-panel hover:border-primary/50 transition-all flex flex-col justify-center items-center gap-0.5 min-w-[75px]"
                  title={rightOpen ? "Collapse right panel" : "Expand right panel"}
                >
                  {rightOpen
                    ? <PanelRightClose className="size-4 text-primary" />
                    : <PanelRightOpen className="size-4 text-primary" />}
                  <span className="text-[9px] font-mono text-muted-foreground">{rightOpen ? "HIDE" : "SHOW"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right: citizen reports (database-backed, 2h rolling history) */}
          <AnimatePresence>
            {rightOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="shrink-0 overflow-hidden h-full"
              >
                <CitizenReports />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
    </CityProvider>
  );
};

export default Index;
