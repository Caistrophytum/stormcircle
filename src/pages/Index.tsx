import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PanelBottomClose, PanelBottomOpen } from "lucide-react";
import CommandSidebar from "@/components/CommandSidebar";
import StatusBar from "@/components/StatusBar";
import TacticalMap from "@/components/TacticalMap";
import PeerReviewQueue from "@/components/PeerReviewQueue";
import IntegrationPanel from "@/components/IntegrationPanel";

const Index = () => {
  const [activeView, setActiveView] = useState("mesh");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [userRole, setUserRole] = useState<"guest" | "citizen" | "meteorologist">("meteorologist");

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [bottomOpen, setBottomOpen] = useState(true);

  const handleSignIn = () => {
    setUserRole("citizen");
  };

  const allCollapsed = !leftOpen && !rightOpen && !bottomOpen;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left sidebar */}
      <AnimatePresence>
        {leftOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="shrink-0 overflow-hidden"
          >
            <CommandSidebar activeView={activeView} onViewChange={setActiveView} />
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col min-w-0">
        <StatusBar userRole={userRole} onSignIn={handleSignIn} />

        <div className="flex-1 flex overflow-hidden relative">
          {/* Panel toggle buttons */}
          <div className="absolute bottom-4 right-4 z-30 flex gap-1">
            <button
              onClick={() => setLeftOpen(!leftOpen)}
              className="glass-panel p-1.5 hover:border-primary/50 transition-colors"
              title={leftOpen ? "Collapse left panel" : "Expand left panel"}
            >
              {leftOpen
                ? <PanelLeftClose className="size-3.5 text-primary" />
                : <PanelLeftOpen className="size-3.5 text-primary" />}
            </button>
            <button
              onClick={() => setRightOpen(!rightOpen)}
              className="glass-panel p-1.5 hover:border-primary/50 transition-colors"
              title={rightOpen ? "Collapse right panel" : "Expand right panel"}
            >
              {rightOpen
                ? <PanelRightClose className="size-3.5 text-primary" />
                : <PanelRightOpen className="size-3.5 text-primary" />}
            </button>
            <button
              onClick={() => setBottomOpen(!bottomOpen)}
              className="glass-panel p-1.5 hover:border-primary/50 transition-colors"
              title={bottomOpen ? "Collapse bottom panel" : "Expand bottom panel"}
            >
              {bottomOpen
                ? <PanelBottomClose className="size-3.5 text-primary" />
                : <PanelBottomOpen className="size-3.5 text-primary" />}
            </button>
          </div>

          {/* Left: map + integrations stacked */}
          <div className="flex-1 flex flex-col min-w-0">
            <TacticalMap
              expanded={mapExpanded || !bottomOpen}
              onToggleExpand={() => setMapExpanded(!mapExpanded)}
            />
            <AnimatePresence>
              {!mapExpanded && bottomOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "45%", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="border-t border-border bg-cockpit overflow-hidden"
                >
                  <IntegrationPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: peer review */}
          <AnimatePresence>
            {rightOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="shrink-0 overflow-hidden"
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
