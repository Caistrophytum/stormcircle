import { useState } from "react";
import { Camera, Video, Radio, Star, Clock, MapPin, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type IntegrationTab = "hazcam" | "traffic" | "network";

interface FeedItem {
  id: string;
  username: string;
  isSkywarn: boolean;
  isVerified: boolean;
  time: string;
  content: string;
  location: string;
  type: string;
  priorityUntil?: string;
}

const mockFeed: FeedItem[] = [
  {
    id: "1",
    username: "WX_CHASE_MIKE",
    isSkywarn: true,
    isVerified: true,
    time: "3m ago",
    content: "Confirmed wall cloud with persistent rotation. Moving NE at 35mph. Tornado likely imminent.",
    location: "34.12°N, 118.31°W",
    type: "ROTATION",
    priorityUntil: "1h",
  },
  {
    id: "2",
    username: "SKYWARN_DFW_42",
    isSkywarn: true,
    isVerified: true,
    time: "8m ago",
    content: "Golf ball hail measured at 1.75in diameter. Wind gusted ~70mph. Power lines down on Oak St.",
    location: "32.78°N, 96.80°W",
    type: "HAIL/WIND",
    priorityUntil: "52m",
  },
  {
    id: "3",
    username: "CITIZEN_JEN",
    isSkywarn: false,
    isVerified: false,
    time: "12m ago",
    content: "Heavy rain and small hail in my neighborhood. Streets flooding near 5th and Main.",
    location: "34.05°N, 118.24°W",
    type: "FLOODING",
  },
  {
    id: "4",
    username: "STORM_OPS_7",
    isSkywarn: false,
    isVerified: true,
    time: "18m ago",
    content: "Doppler confirmed 58dBZ core approaching metro area. ETA 12 minutes.",
    location: "33.95°N, 118.40°W",
    type: "CORE",
  },
];

const hazcams = [
  { id: "hc1", name: "CAM-A7 Riverside Overpass", status: "live", feed: "CLEAR" },
  { id: "hc2", name: "CAM-B3 Industrial District", status: "live", feed: "DEBRIS DETECTED" },
  { id: "hc3", name: "CAM-C1 Valley Bridge", status: "offline", feed: "—" },
];

const trafficCams = [
  { id: "tc1", name: "I-405 S / Wilshire", status: "live", condition: "FLOODED LANES" },
  { id: "tc2", name: "US-101 N / Ventura", status: "live", condition: "REDUCED VIS" },
  { id: "tc3", name: "I-10 E / Downtown", status: "live", condition: "NORMAL" },
];

const IntegrationPanel = () => {
  const [activeTab, setActiveTab] = useState<IntegrationTab>("network");

  const tabs: { id: IntegrationTab; label: string; icon: typeof Camera }[] = [
    { id: "hazcam", label: "HAZCAM", icon: Camera },
    { id: "traffic", label: "TRAFFIC", icon: Video },
    { id: "network", label: "NETWORK", icon: Radio },
  ];

  // Sort feed: SKYWARN first
  const sortedFeed = [...mockFeed].sort((a, b) => {
    if (a.isSkywarn && !b.isSkywarn) return -1;
    if (!a.isSkywarn && b.isSkywarn) return 1;
    return 0;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex justify-start border-b border-border bg-cockpit/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
              activeTab === tab.id
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="size-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <AnimatePresence mode="wait">
          {activeTab === "hazcam" && (
            <motion.div key="hazcam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              {hazcams.map((cam) => (
                <div key={cam.id} className="glass-panel p-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-card-foreground font-bold">{cam.name}</span>
                    <span className={`text-[9px] font-mono uppercase ${cam.status === "live" ? "text-neon-green" : "text-muted-foreground"}`}>
                      {cam.status === "live" ? "● LIVE" : "○ OFFLINE"}
                    </span>
                  </div>
                  <div className="h-16 bg-background/80 rounded-sm flex items-center justify-center border border-border">
                    <span className={`text-[10px] font-mono ${cam.feed === "DEBRIS DETECTED" ? "text-neon-red animate-pulse" : "text-muted-foreground"}`}>
                      [{cam.feed}]
                    </span>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === "traffic" && (
            <motion.div key="traffic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              {trafficCams.map((cam) => (
                <div key={cam.id} className="glass-panel p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-mono text-card-foreground font-bold">{cam.name}</span>
                    <span className="text-[9px] font-mono text-neon-green uppercase">● LIVE</span>
                  </div>
                  <div className="h-12 bg-background/80 rounded-sm flex items-center justify-center border border-border">
                    <span className={`text-[10px] font-mono ${
                      cam.condition === "FLOODED LANES" ? "text-neon-red" :
                      cam.condition === "REDUCED VIS" ? "text-neon-amber" :
                      "text-neon-green"
                    }`}>
                      [{cam.condition}]
                    </span>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === "network" && (
            <motion.div key="network" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              {sortedFeed.map((item) => (
                <div
                  key={item.id}
                  className={`glass-panel p-3 space-y-2 ${
                    item.isSkywarn ? "border-primary/30 bg-primary/5" : ""
                  }`}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-card-foreground">{item.username}</span>
                      {item.isSkywarn && (
                        <span className="text-[8px] font-mono font-bold bg-primary/20 text-primary px-1 py-0.5 rounded-sm flex items-center gap-0.5">
                          <Shield className="size-2.5" />
                          SKYWARN
                        </span>
                      )}
                      {item.isVerified && !item.isSkywarn && (
                        <span className="text-[8px] font-mono font-bold bg-neon-blue/20 text-neon-blue px-1 py-0.5 rounded-sm">
                          VERIFIED
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] font-mono text-muted-foreground">{item.time}</span>
                  </div>

                  {/* SKYWARN priority badge */}
                  {item.isSkywarn && item.priorityUntil && (
                    <div className="flex items-center gap-1 text-[8px] font-mono text-primary/80">
                      <Star className="size-2.5 fill-primary text-primary" />
                      PRIORITY FEED — {item.priorityUntil} remaining
                      <Clock className="size-2.5 ml-1" />
                    </div>
                  )}

                  {/* Type tag */}
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-mono font-bold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-sm">
                      {item.type}
                    </span>
                    <span className="text-[8px] font-mono text-muted-foreground flex items-center gap-0.5">
                      <MapPin className="size-2.5" />
                      {item.location}
                    </span>
                  </div>

                  {/* Content */}
                  <p className="text-[11px] font-mono text-foreground leading-relaxed">{item.content}</p>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default IntegrationPanel;
