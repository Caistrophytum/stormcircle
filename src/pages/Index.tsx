import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import StatusBar from "@/components/StatusBar";
import TacticalMap from "@/components/TacticalMap";
import PeerReviewQueue from "@/components/PeerReviewQueue";
import IntegrationPanel from "@/components/IntegrationPanel";

const Index = () => {
  const [userRole, setUserRole] = useState<"guest" | "citizen" | "meteorologist">("meteorologist");

  const [rightOpen, setRightOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(false);

  const handleSignIn = () => {
    setUserRole("citizen");
  };

  const [viewportW, setViewportW] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1920
  );

  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Width available to the map (center column) given which side panels are open
  const sidePanelWidth = 320;
  const centerWidth = Math.max(
    320,
    viewportW - (leftOpen ? sidePanelWidth : 0) - (rightOpen ? sidePanelWidth : 0)
  );

  // Intrinsic combined width of the top overlays (radar mini-map + EventInfoPanel)
  const radarPanelW = Math.min(340, Math.max(200, viewportW * 0.22));
  const topOverlayIntrinsic = radarPanelW + 500 + 48; // 48 = side padding + gap buffer

  // Scale so the top overlays always fit within the available center width
  const overlayScale = Math.min(1, Math.max(0.6, centerWidth / topOverlayIntrinsic));

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <main className="flex-1 flex flex-col min-w-0">
        <StatusBar userRole={userRole} onSignIn={handleSignIn} />

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
                  className="px-4 h-[50px] glass-panel hover:border-primary/50 transition-all flex flex-col justify-center items-center gap-0.5 min-w-[75px]"
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

          {/* Right: peer review */}
          <AnimatePresence>
            {rightOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="shrink-0 overflow-hidden h-full"
              >
                <PeerReviewQueue userRole={userRole} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default Index;
