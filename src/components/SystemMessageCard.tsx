/**
 * SystemMessageCard — renders an automated bot message (badge "System")
 * such as the SPC Day 1 Outlook update.
 *
 * The bot embeds a structured payload inside an HTML-comment marker:
 *   <!--data:{"issue":"...", "groups":[{label, riskLabel, counties:[...]}]}-->
 * We parse it to render an expandable dropdown per existing risk tier.
 * If the marker is missing/malformed (legacy rows or future format), we
 * fall back to displaying the raw text content (with markers stripped).
 */
import type { RawMessage } from "@/lib/reportGrouping";
import { useEffect, useState } from "react";

interface SPCRiskGroup {
  label: string;
  riskLabel: string;
  counties: { county: string; state: string }[];
}

interface SPCPayload {
  issue: string;
  groups: SPCRiskGroup[];
  // Optional — added in a later schema version. May be missing on older rows.
  timing?: string | null;
  validWindow?: { startZ: string; endZ: string } | null;
}

const DATA_MARKER_RE = /<!--data:([\s\S]*?)-->/;
const ALL_MARKERS_RE = /\s*<!--(?:issue|data):[\s\S]*?-->\s*/g;

function parseSPCPayload(content: string): SPCPayload | null {
  const m = content.match(DATA_MARKER_RE);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (!parsed || !Array.isArray(parsed.groups)) return null;
    return parsed as SPCPayload;
  } catch {
    return null;
  }
}

// Per-risk visual styling, scaled along the project's amber/red severity
// system. MRGL is calmest, HIGH is most severe.
const RISK_STYLE: Record<string, { fg: string; bg: string; border: string }> = {
  MRGL: { fg: "#7CFC00", bg: "rgba(124,252,0,0.08)", border: "rgba(124,252,0,0.35)" },
  SLGT: { fg: "#FFD700", bg: "rgba(255,215,0,0.08)", border: "rgba(255,215,0,0.35)" },
  ENH: { fg: "#FFA500", bg: "rgba(255,165,0,0.10)", border: "rgba(255,165,0,0.40)" },
  MDT: { fg: "#FF4500", bg: "rgba(255,69,0,0.12)", border: "rgba(255,69,0,0.45)" },
  HIGH: { fg: "#FF1744", bg: "rgba(255,23,68,0.15)", border: "rgba(255,23,68,0.50)" },
};

export function SystemMessageCard({
  message,
  expandedKey,
  toggle,
}: {
  message: RawMessage;
  expandedKey: Set<string>;
  toggle: (id: string) => void;
}) {
  const isHurricane = message.username === "Hurricane Bot";
  const payload = isHurricane ? null : parseSPCPayload(message.content);
  const [fallbackTiming, setFallbackTiming] = useState<string | null>(null);
  const [fallbackValidWindow, setFallbackValidWindow] = useState<SPCPayload["validWindow"]>(null);
  // Strip SPC markers AND hurricane bot markers.
  const HURRICANE_MARKERS_RE = /\s*<!--(?:htype|hadv):[\s\S]*?-->\s*/g;
  const stripped = message.content
    .replace(ALL_MARKERS_RE, "")
    .replace(HURRICANE_MARKERS_RE, "")
    .trim();
  const headerLine = stripped.split("\n")[0] ?? (isHurricane ? "Hurricane Bot" : "SPC Day 1 Outlook");

  if (isHurricane) {
    return (
      <div
        className="rounded border px-3 py-2 font-mono text-[11px]"
        style={{
          background: "rgba(0, 150, 255, 0.08)",
          borderColor: "rgba(0, 150, 255, 0.3)",
          color: "#7dd3fc",
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span
            className="text-[9px] uppercase tracking-wide font-bold"
            style={{ color: "#00aaff" }}
          >
            🌀 Hurricane Bot · System
          </span>
          <span className="text-[9px] opacity-70">
            {new Date(message.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <p className="whitespace-pre-line opacity-95 leading-snug">{stripped}</p>
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;

    if (!payload || payload.timing || payload.validWindow) {
      setFallbackTiming(null);
      setFallbackValidWindow(null);
      return;
    }

    const fetchFallbackTiming = async () => {
      try {
        const res = await fetch("https://www.spc.noaa.gov/products/outlook/day1otlk.txt", {
          cache: "no-store",
        });
        if (!res.ok) return;

        const text = await res.text();
        const validMatch = text.match(/VALID\s+\d{2}(\d{4})Z\s*-\s*\d{2}(\d{4})Z/i);
        const nextValidWindow = validMatch
          ? {
              startZ: `${validMatch[1].slice(0, 2)}:${validMatch[1].slice(2)}Z`,
              endZ: `${validMatch[2].slice(0, 2)}:${validMatch[2].slice(2)}Z`,
            }
          : null;

        const body = text.replace(/VALID\s+\d{6}Z\s*-\s*\d{6}Z/gi, "");
        const sentences = body
          .split(/(?<=\.)\s+/)
          .map((s) => s.replace(/\s+/g, " ").trim())
          .filter((s) => s.length > 20 && s.length < 400);
        const zRe = /\b\d{1,2}(?:-\d{1,2})?Z\b/;
        const firingRe = /\b(develop|developing|initiation|initiate|initiating|fire|firing|form|forming|expected to develop|robust convection)\b/i;
        const nextTiming =
          sentences.find((s) => zRe.test(s) && firingRe.test(s)) ??
          sentences.find((s) => zRe.test(s)) ??
          null;

        if (!cancelled) {
          setFallbackTiming(nextTiming);
          setFallbackValidWindow(nextValidWindow);
        }
      } catch {
        if (!cancelled) {
          setFallbackTiming(null);
          setFallbackValidWindow(null);
        }
      }
    };

    void fetchFallbackTiming();
    return () => {
      cancelled = true;
    };
  }, [payload, message.id]);

  const visibleTiming = payload?.timing ?? fallbackTiming;
  const visibleValidWindow = payload?.validWindow ?? fallbackValidWindow;

  return (
    <div
      className="rounded border px-3 py-2 font-mono text-[11px]"
      style={{
        background: "rgba(255, 165, 0, 0.08)",
        borderColor: "rgba(255, 165, 0, 0.3)",
        color: "#ffa500",
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[9px] uppercase tracking-wide opacity-80">
          {message.username} · System
        </span>
        <span className="text-[9px] opacity-70">
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <p className="mb-1.5">{headerLine}</p>

      {/* Expected firing time(s) — pulled from the SPC Day 1 forecast
          discussion when available, otherwise falls back to the official
          outlook VALID window. Hidden entirely when neither is present
          (e.g. older bot rows posted before this field existed). */}
      {payload && (visibleTiming || visibleValidWindow) && (
        <p
          className="mb-1.5 text-[10px] leading-snug pl-2 border-l"
          style={{
            borderColor: "rgba(255,165,0,0.4)",
            color: "rgba(255,200,120,0.95)",
          }}
        >
          <span className="opacity-70 uppercase tracking-wide mr-1">Expected:</span>
          {visibleTiming
            ? visibleTiming
            : `Outlook valid ${visibleValidWindow!.startZ} – ${visibleValidWindow!.endZ}`}
        </p>
      )}

      {payload ? (
        <div className="space-y-1">
          {payload.groups.map((g) => {
            const key = `${message.id}::${g.label}`;
            const open = expandedKey.has(key);
            const style = RISK_STYLE[g.label] ?? {
              fg: "#ffa500",
              bg: "rgba(255,165,0,0.08)",
              border: "rgba(255,165,0,0.3)",
            };
            return (
              <div
                key={g.label}
                className="rounded border overflow-hidden"
                style={{ borderColor: style.border, background: style.bg }}
              >
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="w-full flex items-center justify-between px-2 py-1 text-left hover:opacity-90 transition-opacity"
                  style={{ color: style.fg }}
                >
                  <span className="text-[10px] uppercase tracking-wide font-bold">
                    {g.riskLabel}
                  </span>
                  <span className="flex items-center gap-1.5 text-[9px] opacity-80">
                    <span>
                      {g.counties.length} {g.counties.length === 1 ? "county" : "counties"}
                    </span>
                    <span>{open ? "▾" : "▸"}</span>
                  </span>
                </button>
                {open && (
                  <ul
                    className="px-2 py-1.5 space-y-0.5 border-t text-[10px] max-h-48 overflow-y-auto"
                    style={{ borderColor: style.border, color: style.fg }}
                  >
                    {g.counties.map((c, i) => (
                      <li key={`${c.state}-${c.county}-${i}`} className="opacity-90">
                        {c.county}, {c.state}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="whitespace-pre-line opacity-90">
          {stripped.split("\n").slice(1).join("\n").trim()}
        </p>
      )}
    </div>
  );
}
