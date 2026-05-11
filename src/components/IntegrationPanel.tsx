import { Radio } from "lucide-react";
import { motion } from "framer-motion";
import { getLSRColor, getSourceColor, useLSR } from "@/hooks/useLSR";

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
  const { reports, loading, error, lastUpdated } = useLSR();

  return (
    <div className="flex flex-col h-full">
      <div className="flex w-full items-center justify-center gap-1.5 border-b-2 border-primary bg-primary/5 px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
        <Radio className="size-3" />
        SKYWARN
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 w-fit">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col gap-2">
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
      </div>
    </div>
  );
};

export default IntegrationPanel;
