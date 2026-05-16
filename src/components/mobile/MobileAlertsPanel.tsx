/**
 * MobileAlertsPanel — the mobile equivalent of the desktop EventInfoPanel +
 * LSR list. Renders four collapsible/expandable sections, top-to-bottom:
 *
 *   1. Top 10 Most Dangerous   (from useAlerts.mostDangerous)
 *   2. Top 10 Hazards          (most common active warnings, from useAlerts.topHazards)
 *   3. New Warnings            (first-seen in the last 5 refresh cycles,
 *                               from useAlerts.newWarnings — same rolling
 *                               window timer as the desktop card)
 *   4. SKYWARN Reports         (latest LSRs from useLSR)
 *
 * All four sections use the same underlying 60 s refresh cadence as the
 * desktop (useAlerts polls api.weather.gov/alerts/active every 60 s; useLSR
 * polls IEM every 60 s). The "Last updated …" footers mirror the desktop
 * relative-time display and re-render every 5 s via a shared `now` ticker.
 *
 * The whole panel scrolls vertically when content exceeds the viewport.
 */
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAlerts, type Alert, type Severity, type AlertKind } from "@/hooks/useAlerts";
import { useLSR, getLSRColor, getSourceColor } from "@/hooks/useLSR";

// ── Badge palettes mirrored from desktop EventInfoPanel ────────────────────
const severityBg: Record<Severity, string> = {
  Extreme: "#dc2626",
  Severe: "#f97316",
  Moderate: "#facc15",
  Minor: "#3b82f6",
  Unknown: "#52525b",
};
const severityFg: Record<Severity, string> = {
  Extreme: "#fff",
  Severe: "#fff",
  Moderate: "#000",
  Minor: "#fff",
  Unknown: "#d4d4d8",
};
const kindBg: Record<AlertKind, string> = {
  Emergency: "#b91c1c",
  Warning: "#ea580c",
  Watch: "#eab308",
  Advisory: "#2563eb",
  Statement: "#64748b",
  Other: "#52525b",
};
const kindFg: Record<AlertKind, string> = {
  Emergency: "#fff",
  Warning: "#fff",
  Watch: "#000",
  Advisory: "#fff",
  Statement: "#fff",
  Other: "#d4d4d8",
};
const tagBg: Record<string, string> = {
  PDS: "#a21caf",
  "Tornado Emergency": "#991b1b",
  "Flash Flood Emergency": "#991b1b",
  Catastrophic: "#b91c1c",
  Destructive: "#c2410c",
  Considerable: "#d97706",
};

// Same "Xs ago / X min ago / X hr ago" formatter the desktop panel uses.
function formatRelativeTime(date: Date, now: Date): string {
  const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.floor(diffHr / 24)} d ago`;
}

function formatLSRTime(valid: string): string {
  if (!valid) return "";
  const d = new Date(valid);
  if (Number.isNaN(d.getTime())) return valid;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Collapsible section wrapper ────────────────────────────────────────────
interface SectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}
function Section({ title, open, onToggle, footer, children }: SectionProps) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,157,0,0.15)",
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          background: "rgba(255,157,0,0.06)",
          border: "none",
          cursor: "pointer",
          color: "#ff9d00",
          fontFamily: "inherit",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        <span>{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {children}
          {footer && (
            <div
              style={{
                marginTop: "4px",
                paddingTop: "6px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                fontSize: "9px",
                color: "#888",
                letterSpacing: "0.1em",
              }}
            >
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Row renderers ──────────────────────────────────────────────────────────
function DangerousRow({ alert, index }: { alert: Alert; index: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
        <span style={{ color: "#666", fontSize: "11px", width: "16px" }}>{index + 1}.</span>
        <span style={{ color: "#fff", fontSize: "12px", fontWeight: 700, lineHeight: 1.2 }}>{alert.event}</span>
      </div>
      <div style={{ marginLeft: "22px", color: "#888", fontSize: "10px", lineHeight: 1.3 }}>
        {alert.areaDesc}
      </div>
      <div style={{ marginLeft: "22px", display: "flex", flexWrap: "wrap", gap: "3px" }}>
        <span
          style={{
            fontSize: "9px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            padding: "1px 5px",
            borderRadius: "2px",
            background: severityBg[alert.severity],
            color: severityFg[alert.severity],
            textTransform: "uppercase",
          }}
        >
          {alert.severity}
        </span>
        {alert.kind !== "Other" && (
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              padding: "1px 5px",
              borderRadius: "2px",
              background: kindBg[alert.kind],
              color: kindFg[alert.kind],
              textTransform: "uppercase",
            }}
          >
            {alert.kind}
          </span>
        )}
        {alert.tags.map((t) => (
          <span
            key={t}
            style={{
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              padding: "1px 5px",
              borderRadius: "2px",
              background: tagBg[t] ?? "#52525b",
              color: "#fff",
              textTransform: "uppercase",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function CountRow({
  event,
  count,
  index,
  badgeColor,
}: {
  event: string;
  count: number;
  index: number;
  badgeColor: "primary" | "destructive";
}) {
  const bg = badgeColor === "primary" ? "rgba(255,157,0,0.15)" : "rgba(220,38,38,0.18)";
  const border = badgeColor === "primary" ? "1px solid rgba(255,157,0,0.4)" : "1px solid rgba(220,38,38,0.5)";
  const fg = badgeColor === "primary" ? "#ff9d00" : "#fca5a5";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "6px", minWidth: 0 }}>
        <span style={{ color: "#666", fontSize: "11px", width: "16px" }}>{index + 1}.</span>
        <span
          style={{
            color: "#fff",
            fontSize: "12px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {event}
        </span>
      </div>
      <span
        style={{
          fontSize: "10px",
          fontWeight: 600,
          padding: "1px 6px",
          borderRadius: "2px",
          background: bg,
          border,
          color: fg,
          flexShrink: 0,
        }}
      >
        {count} {badgeColor === "destructive" ? "New" : "active"}
      </span>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────
export default function MobileAlertsPanel() {
  const { mostDangerous, topHazards, newWarnings, loading, error, lastUpdated } = useAlerts();
  const { reports: lsrReports, loading: lsrLoading, lastUpdated: lsrUpdated } = useLSR();

  // Independent open/closed state per section. All start expanded.
  const [openDangerous, setOpenDangerous] = useState(true);
  const [openHazards, setOpenHazards] = useState(true);
  const [openNew, setOpenNew] = useState(true);
  const [openLSR, setOpenLSR] = useState(true);

  // Shared 5 s ticker so the "Last updated" relative-time strings stay fresh.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        padding: "12px 12px 88px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {/* 1. Top 10 Most Dangerous — sorted by severity/kind/tags via useAlerts.dangerScore */}
      <Section
        title="Top 10 Most Dangerous"
        open={openDangerous}
        onToggle={() => setOpenDangerous((v) => !v)}
        footer={lastUpdated ? `Last updated ${formatRelativeTime(lastUpdated, now)}` : undefined}
      >
        {loading && mostDangerous.length === 0 && (
          <span style={{ color: "#888", fontSize: "11px" }}>Loading…</span>
        )}
        {error && <span style={{ color: "#f87171", fontSize: "11px" }}>Error: {error}</span>}
        {!loading && !error && mostDangerous.length === 0 && (
          <span style={{ color: "#888", fontSize: "11px" }}>No active alerts</span>
        )}
        {mostDangerous.map((a, i) => (
          <DangerousRow key={`${a.event}-${i}`} alert={a} index={i} />
        ))}
      </Section>

      {/* 2. Top 10 Hazards — counts of each event type, descending */}
      <Section
        title="Top 10 Hazards"
        open={openHazards}
        onToggle={() => setOpenHazards((v) => !v)}
        footer={lastUpdated ? `Last updated ${formatRelativeTime(lastUpdated, now)}` : undefined}
      >
        {loading && topHazards.length === 0 && (
          <span style={{ color: "#888", fontSize: "11px" }}>Loading…</span>
        )}
        {!loading && topHazards.length === 0 && (
          <span style={{ color: "#888", fontSize: "11px" }}>No active hazards</span>
        )}
        {topHazards.map((h, i) => (
          <CountRow key={h.event} event={h.event} count={h.count} index={i} badgeColor="primary" />
        ))}
      </Section>

      {/* 3. New Warnings — warnings first observed inside the last 5 refresh cycles */}
      <Section
        title="New Warnings"
        open={openNew}
        onToggle={() => setOpenNew((v) => !v)}
        footer="Last 5 refresh cycles"
      >
        {loading && newWarnings.length === 0 && (
          <span style={{ color: "#888", fontSize: "11px" }}>Loading…</span>
        )}
        {!loading && newWarnings.length === 0 && (
          <span style={{ color: "#888", fontSize: "11px" }}>No new warnings</span>
        )}
        {newWarnings.map((h, i) => (
          <CountRow key={h.event} event={h.event} count={h.count} index={i} badgeColor="destructive" />
        ))}
      </Section>

      {/* 4. SKYWARN Reports — latest LSRs from IEM (2 h rolling window) */}
      <Section
        title="SKYWARN Reports"
        open={openLSR}
        onToggle={() => setOpenLSR((v) => !v)}
        footer={lsrUpdated ? `Last updated ${formatRelativeTime(lsrUpdated, now)}` : undefined}
      >
        {lsrLoading && lsrReports.length === 0 && (
          <span style={{ color: "#888", fontSize: "11px" }}>Loading reports…</span>
        )}
        {!lsrLoading && lsrReports.length === 0 && (
          <span style={{ color: "#888", fontSize: "11px" }}>No recent reports</span>
        )}
        {lsrReports.map((r, i) => {
          const typeColor = getLSRColor(r.typetext);
          const srcColor = getSourceColor(r.source);
          const location = [r.city, r.state].filter(Boolean).join(", ");
          const mag =
            r.magnitude !== null && r.magnitude !== 0
              ? `${r.magnitude}${/wind/i.test(r.typetext) ? " mph" : /hail/i.test(r.typetext) ? '"' : ""}`
              : "";
          return (
            <div
              key={`${r.valid}-${i}`}
              style={{
                borderLeft: `3px solid ${typeColor}`,
                padding: "5px 8px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "2px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                <span style={{ color: "#fff", fontSize: "11px", fontWeight: 600 }}>
                  {r.typetext}
                  {mag && <span style={{ color: typeColor, marginLeft: 6 }}>{mag}</span>}
                </span>
                <span style={{ color: "#888", fontSize: "10px", flexShrink: 0 }}>
                  {formatLSRTime(r.valid)}
                </span>
              </div>
              <div style={{ color: "#aaa", fontSize: "10px", marginTop: "2px", lineHeight: 1.4 }}>
                {location || r.county}
                {r.county && location && ` (${r.county} Co.)`}
              </div>
              {r.source && (
                <div
                  style={{
                    marginTop: "2px",
                    display: "inline-block",
                    fontSize: "9px",
                    padding: "1px 5px",
                    borderRadius: "2px",
                    background: "rgba(255,255,255,0.06)",
                    color: srcColor,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                  }}
                >
                  {r.source}
                </div>
              )}
              {r.remark && (
                <div style={{ color: "#888", fontSize: "10px", marginTop: "3px", lineHeight: 1.4 }}>
                  {r.remark}
                </div>
              )}
            </div>
          );
        })}
      </Section>
    </div>
  );
}
