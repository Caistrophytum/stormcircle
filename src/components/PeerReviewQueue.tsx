import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface StackedReport {
  id: string;
  topic: string;
  count: number;
  latestTime: string;
  type: "REPORT" | "VISUAL" | "DATA";
}

const initialReports: StackedReport[] = [
  { id: "1", topic: "Large Hail In Tulsa", count: 47, latestTime: "1m ago", type: "REPORT" },
  { id: "2", topic: "Funnel Cloud Near Baker Field", count: 23, latestTime: "3m ago", type: "VISUAL" },
  { id: "3", topic: "Flash Flooding On Hwy 42", count: 15, latestTime: "5m ago", type: "REPORT" },
  { id: "4", topic: "Power Outage Downtown OKC", count: 8, latestTime: "8m ago", type: "DATA" },
  { id: "5", topic: "Debris On I-44 Eastbound", count: 4, latestTime: "12m ago", type: "VISUAL" },
  { id: "6", topic: "Barometric Drop Station Delta", count: 2, latestTime: "18m ago", type: "DATA" },
];

const typeColors: Record<string, string> = {
  REPORT: "bg-primary/20 text-primary border-primary/30",
  VISUAL: "bg-accent/20 text-accent-foreground border-accent/30",
  DATA: "bg-secondary text-secondary-foreground border-border",
};

function normalize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
}

function findMatch(reports: StackedReport[], input: string): number {
  const words = normalize(input);
  if (words.length === 0) return -1;
  let bestIdx = -1, bestScore = 0;
  for (let i = 0; i < reports.length; i++) {
    const topicWords = normalize(reports[i].topic);
    const score = words.filter(w => topicWords.some(tw => tw.includes(w) || w.includes(tw))).length;
    const ratio = score / Math.max(words.length, 1);
    if (ratio >= 0.5 && score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

const PeerReviewQueue = () => {
  const [reports, setReports] = useState<StackedReport[]>(initialReports);
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setReports(prev => {
      const idx = findMatch(prev, trimmed);
      let next: StackedReport[];
      if (idx >= 0) {
        next = prev.map((r, i) =>
          i === idx ? { ...r, count: r.count + 1, latestTime: "just now" } : r
        );
      } else {
        next = [
          ...prev,
          {
            id: crypto.randomUUID(),
            topic: toTitleCase(trimmed),
            count: 1,
            latestTime: "just now",
            type: "REPORT",
          },
        ];
      }
      return next.sort((a, b) => b.count - a.count);
    });
    setInput("");
  };

  return (
    <aside className="w-80 h-full border-l border-border bg-cockpit flex flex-col shrink-0">
      <div className="p-4 border-b border-border bg-shroud/30">
        <h3 className="text-xs font-mono font-bold text-card-foreground uppercase flex items-center gap-2">
          <span className="size-1.5 bg-primary rounded-full" />
          Citizen Reports
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        <AnimatePresence>
          {reports.map((report, i) => (
            <motion.div
              key={report.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: i * 0.05 }}
              className="bg-shroud border border-border p-3 space-y-2 hover:border-primary/20 transition-colors"
            >
              <div className="flex justify-between items-start gap-2">
                <span className="text-xs font-mono font-bold text-card-foreground leading-tight">
                  {report.topic}
                </span>
                <span className={`shrink-0 text-[9px] font-mono px-1.5 py-0.5 border rounded ${typeColors[report.type]}`}>
                  {report.type}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-primary font-bold">
                  {report.count} {report.count === 1 ? "report" : "reports"}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">{report.latestTime}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="py-1.5 bg-neon-green/10 border border-neon-green/20 text-neon-green font-mono text-[10px] uppercase font-bold hover:bg-neon-green hover:text-background transition-all rounded-sm">
                  Verify
                </button>
                <button className="py-1.5 bg-destructive/10 border border-destructive/20 text-destructive font-mono text-[10px] uppercase font-bold hover:bg-destructive hover:text-destructive-foreground transition-all rounded-sm">
                  Reject
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Comment Input */}
      <div className="p-3 border-t border-border bg-shroud/30">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Report an event..."
            className="flex-1 bg-background/50 border border-border px-2 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
          />
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary font-mono text-[10px] uppercase font-bold hover:bg-primary hover:text-background transition-all rounded-sm"
          >
            Send
          </button>
        </div>
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
