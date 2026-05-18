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
import { useState, useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import StatusBar from "@/components/StatusBar";
import CitizenReports from "@/components/CitizenReports";
import IntegrationPanel from "@/components/IntegrationPanel";
import { CityProvider } from "@/contexts/CityContext";
import { useNewReportPing } from "@/hooks/useNewReportPing";
import { useNewLSRPing } from "@/hooks/useNewLSRPing";

// TacticalMap pulls in Leaflet + plugins (~hundreds of KB). Lazy-load it so
// the StatusBar / side panels can paint while the map bundle downloads.
const TacticalMap = lazy(() => import("@/components/TacticalMap"));
const MapFallback = () => (
  <div className="w-full h-full bg-background" aria-hidden />
);



const Index = () => {
  // SPC Day 1 outlook + Hurricane / NHC advisory posting now run server-side
  // via the spc-poll, nhc-poll and enso-poll edge functions (pg_cron). Clients
  // just receive the resulting bot messages via the existing Realtime feed.


  // Side-panel open/close state.
  const [rightOpen, setRightOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(false);

  // Glow the LEFT menu button (~2s) whenever a new Professional Weather Report arrives.
  const lsrPing = useNewLSRPing();
  const [leftGlow, setLeftGlow] = useState(false);
  useEffect(() => {
    if (lsrPing === 0) return;
    setLeftGlow(true);
    const t = setTimeout(() => setLeftGlow(false), 2000);
    return () => clearTimeout(t);
  }, [lsrPing]);

  // Glow the RIGHT panel button (~2s) whenever a new chat message arrives.
  const chatPing = useNewReportPing();
  const [rightGlow, setRightGlow] = useState(false);
  useEffect(() => {
    if (chatPing === 0) return;
    setRightGlow(true);
    const t = setTimeout(() => setRightGlow(false), 2000);
    return () => clearTimeout(t);
  }, [chatPing]);

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
    <>
      <Helmet>
        <title>StormCircle — Weather Social Network for Meteorologists</title>
        <meta name="description" content="StormCircle connects meteorologists and the public for real-time storm reporting, weather communication, and meteorological information sharing." />
        <link rel="canonical" href="https://stormcircle.net/" />

        {/* Open Graph for social sharing */}
        <meta property="og:title" content="StormCircle — Weather Social Network" />
        <meta property="og:description" content="Real-time storm reports, meteorologist verified alerts, and community weather communication." />
        <meta property="og:url" content="https://stormcircle.net/" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://stormcircle.net/og-image.png" />
      </Helmet>

      <h1 className="sr-only">StormCircle — Real-time Meteorological Network</h1>
      <CityProvider>
    <div className="flex h-[100dvh] overflow-hidden bg-background">
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
            <Suspense fallback={<MapFallback />}>
              <TacticalMap overlayScale={overlayScale} />
            </Suspense>

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
                  className={`px-4 h-[50px] glass-panel hover:border-primary/50 transition-all flex flex-col justify-center items-center gap-0.5 min-w-[75px] ${
                    rightGlow ? "report-glow" : ""
                  }`}
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
    </>
  );
};

export default Index;
