import { useState } from "react";
import CommandSidebar from "@/components/CommandSidebar";
import StatusBar from "@/components/StatusBar";
import TacticalMap from "@/components/TacticalMap";
import PeerReviewQueue from "@/components/PeerReviewQueue";

const Index = () => {
  const [activeView, setActiveView] = useState("mesh");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <CommandSidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 flex flex-col">
        <StatusBar />
        <div className="flex-1 flex overflow-hidden">
          <TacticalMap />
          <PeerReviewQueue />
        </div>
      </main>
    </div>
  );
};

export default Index;
