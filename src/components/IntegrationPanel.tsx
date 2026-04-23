import { useState } from "react";
import { Camera, Video, Radio, Star, Clock, MapPin, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getLSRColor, getSourceColor, useLSR } from "@/hooks/useLSR";

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

const mockFeed: FeedItem[] = [];

const hazcams: { id: string; name: string; status: string; feed: string }[] = [];

const trafficCams: { id: string; name: string; status: string; condition: string }[] = [];

function getTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function getMagnitudeUnit(typetext: string): string {
  const t = typetext.toUpperCase();
  if (t.includes("HAIL")) return "in.";
  if (t.includes("WIND")) return "mph";
  if (t.includes("SNOW") || t.includes("RAIN")) return "in.";
  if (t.includes("FLOOD")) return "ft.";
  return "";
}

const IntegrationPanel = () => {
  const [activeTab, setActiveTab] = useState<IntegrationTab>("network");
  const { reports, loading, error, lastUpdated } = useLSR();

  const tabs: { id: IntegrationTab; label: string; icon: typeof Camera }[] = [
    { id: "hazcam", label: "HAZCAM", icon: Camera },
    { id: "traffic", label: "TRAFFIC", icon: Video },
    { id: "network", label: "SKYWARN", icon: Radio },
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
      <div className="flex justify-start border-b border-border bg-cockpit/50 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
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
      <div className="flex-1 overflow-y-auto p-3 space-y-2 w-fit">
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
            <motion.div key="network" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col gap-2">
              <div className="glass-panel flex flex-wrap gap-x-3 gap-y-1 p-2 text-[10px] font-mono font-bold uppercase">
                {["TORNADO", "LARGE HAIL", "DAMAGING WIND", "FLOOD", "FLASH FLOOD"].map((type) => {
                  const count = reports.filter((report) =>
                    report.typetext.toUpperCase().includes(type)
                  ).length;
                  if (count === 0) return null;
                  return (
                    <span key={type} style={{ color: getLSRColor(type) }}>
                      {type}: {count}
                    </span>
                  );
                })}
                {loading && <span className="text-muted-foreground">LOADING LSR...</span>}
                {error && <span className="text-destructive">LSR ERROR</span>}
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {reports.map((report) => (
                  <div
                    key={`${report.valid}-${report.typetext}-${report.lat}-${report.lon}`}
                    className="glass-panel space-y-2 p-3 font-mono"
                    style={{ borderLeft: `3px solid ${getLSRColor(report.typetext)}` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[11px] font-bold uppercase" style={{ color: getLSRColor(report.typetext) }}>
                        {report.typetext}
                      </span>
                      <span className="shrink-0 text-[9px] text-muted-foreground">{getTimeAgo(report.valid)}</span>
                    </div>
                    <span className="block text-[10px] text-card-foreground">
                      {report.city}, {report.county} Co., {report.state}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="font-bold uppercase"
                        style={{
                          background: getSourceColor(report.source),
                          color: "#000",
                          borderRadius: "3px",
                          padding: "1px 5px",
                          fontSize: "10px",
                        }}
                      >
                        {report.source}
                      </span>
                      {report.magnitude && (
                        <span className="text-[10px] font-bold text-foreground">
                          {report.magnitude} {getMagnitudeUnit(report.typetext)}
                        </span>
                      )}
                    </div>
                    {report.remark && (
                      <p className="text-[11px] leading-relaxed" style={{ color: "#aaa", fontSize: "11px" }}>
                        {report.remark}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <span className="border-t border-border pt-2 text-[9px] font-mono text-muted-foreground">
                Last updated: {lastUpdated ? getTimeAgo(lastUpdated.toISOString()) : "—"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default IntegrationPanel;
