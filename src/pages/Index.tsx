import { useState } from "react";
import CommandSidebar from "@/components/CommandSidebar";
import StatusBar from "@/components/StatusBar";
import TacticalMap from "@/components/TacticalMap";
import PeerReviewQueue from "@/components/PeerReviewQueue";
import IntegrationPanel from "@/components/IntegrationPanel";

const Index = () => {
  const [activeView, setActiveView] = useState("mesh");
  const [mapExpanded, setMapExpanded] = useState(false);
  const [userRole, setUserRole] = useState<"guest" | "citizen" | "meteorologist">("meteorologist");

  const handleSignIn = () => {
    // Mock sign-in toggle for demo
    setUserRole("citizen");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <CommandSidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 flex flex-col min-w-0">
        <StatusBar userRole={userRole} onSignIn={handleSignIn} />
        <div className="flex-1 flex overflow-hidden">
          {/* Left: map + integrations stacked */}
          <div className="flex-1 flex flex-col min-w-0">
            <TacticalMap expanded={mapExpanded} onToggleExpand={() => setMapExpanded(!mapExpanded)} />
            {!mapExpanded && (
              <div className="h-[45%] border-t border-border bg-cockpit overflow-hidden">
                <IntegrationPanel />
              </div>
            )}
          </div>
          {/* Right: peer review */}
          <PeerReviewQueue />
        </div>
      </main>
    </div>
  );
};

export default Index;
