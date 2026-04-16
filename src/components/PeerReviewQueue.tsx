import { motion } from "framer-motion";

interface Report {
  id: string;
  initials: string;
  username: string;
  time: string;
  content: string;
  type: "REPORT" | "VISUAL" | "DATA";
}

const mockReports: Report[] = [
  {
    id: "1",
    initials: "JD",
    username: "JASON_D88",
    time: "2m ago",
    content: "REPORT: Sudden microburst, visibility < 50m. Trees down on Hwy 42.",
    type: "REPORT",
  },
  {
    id: "2",
    initials: "SK",
    username: "SKY_OBSERVER",
    time: "5m ago",
    content: "VISUAL: Funnel cloud spotted rotating over Baker Field.",
    type: "VISUAL",
  },
  {
    id: "3",
    initials: "MR",
    username: "METEO_RAD",
    time: "12m ago",
    content: "DATA: Barometric drop of 4.2 hPa in 15 mins at Station Delta.",
    type: "DATA",
  },
];

const PeerReviewQueue = () => {
  return (
    <aside className="w-80 border-l border-border bg-cockpit flex flex-col shrink-0">
      <div className="p-4 border-b border-border bg-shroud/30">
        <h3 className="text-xs font-mono font-bold text-card-foreground uppercase flex items-center gap-2">
          <span className="size-1.5 bg-primary rounded-full" />
          Verification Queue
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {mockReports.map((report, i) => (
          <motion.div
            key={report.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15 }}
            className="bg-shroud border border-border p-4 space-y-3 hover:border-primary/20 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <div className="size-6 bg-secondary rounded font-mono text-[10px] flex items-center justify-center text-card-foreground">
                  {report.initials}
                </div>
                <span className="text-xs font-bold text-card-foreground">{report.username}</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">{report.time}</span>
            </div>
            <div className="bg-background/50 p-2 border border-border">
              <p className="text-xs font-mono text-foreground">{report.content}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="py-2 bg-neon-green/10 border border-neon-green/20 text-neon-green font-mono text-[10px] uppercase font-bold hover:bg-neon-green hover:text-background transition-all rounded-sm">
                Verify
              </button>
              <button className="py-2 bg-destructive/10 border border-destructive/20 text-destructive font-mono text-[10px] uppercase font-bold hover:bg-destructive hover:text-destructive-foreground transition-all rounded-sm">
                Reject
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Stats */}
      <div className="p-4 bg-background/40 border-t border-border">
        <div className="flex flex-col gap-2 font-mono text-[10px]">
          <div className="flex justify-between text-muted-foreground">
            <span>NETWORK RELIABILITY</span>
            <span className="text-neon-green">99.98%</span>
          </div>
          <div className="w-full h-0.5 bg-secondary rounded-full overflow-hidden">
            <div className="w-[99%] h-full bg-neon-green" />
          </div>
        </div>
      </div>
    </aside>
  );
};

export default PeerReviewQueue;
