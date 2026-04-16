import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import StatusBar from "@/components/StatusBar";
import TacticalMap from "@/components/TacticalMap";
import PeerReviewQueue from "@/components/PeerReviewQueue";
import IntegrationPanel from "@/components/IntegrationPanel";

const Index = () => {
  const [activeView, setActiveView] = useState("mesh");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [userRole, setUserRole] = useState<"guest" | "citizen" | "meteorologist">("meteorologist");

  const [rightOpen, setRightOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);

  const handleSignIn = () => {
    setUserRole("citizen");
  };

  const overlayScale = Math.max(
    0.8,
    1 -
      (rightOpen ? 0.08 : 0) -
      (leftOpen ? 0.07 : 0)
  );

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
                animate={{ width: 320, opacity: 1 }}
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
            <TacticalMap
              expanded={mapExpanded}
              onToggleExpand={() => setMapExpanded(!mapExpanded)}
              overlayScale={overlayScale}
            />

            {/* Panel toggle buttons - bottom-right */}
            <div
              className="absolute bottom-4 right-4 z-30 origin-bottom-right"
              style={{ transform: `scale(${overlayScale})` }}
            >
              <div className="flex gap-2">
                <button
                  onClick={() => setLeftOpen(!leftOpen)}
                  className="px-4 h-11 glass-panel hover:border-primary/50 transition-all flex flex-col justify-center items-center gap-0.5 min-w-[75px]"
                  title={leftOpen ? "Collapse left panel" : "Expand left panel"}
                >
                  {leftOpen
                    ? <PanelLeftClose className="size-4 text-primary" />
                    : <PanelLeftOpen className="size-4 text-primary" />}
                  <span className="text-[9px] font-mono text-muted-foreground">{leftOpen ? "HIDE" : "SHOW"}</span>
                </button>
                <button
                  onClick={() => setRightOpen(!rightOpen)}
                  className="px-4 h-11 glass-panel hover:border-primary/50 transition-all flex flex-col justify-center items-center gap-0.5 min-w-[75px]"
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
                <PeerReviewQueue />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default Index;
