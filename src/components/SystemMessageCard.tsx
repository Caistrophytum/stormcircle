/**
 * SystemMessageCard — renders an automated bot message (badge "System").
 *
 * The bot embeds a structured payload inside an HTML-comment marker:
 *   <!--data:{"v":2,"issue":"...","groups":[...],"summary":"...","hazards":[...]}-->
 *
 * As of payload v2, the SPC summary text and per-hazard probabilities are
 * built server-side in `spc-poll`, derived from SPC's official categorical
 * + per-hazard probability layers. This component renders them directly —
 * no prose scanning, no client-side fetches to spc.noaa.gov.
 *
 * Legacy rows (payload v1, no `hazards`) still render: we fall back to the
 * payload's prebuilt `summary` if present, otherwise just the categorical
 * groups, with no hazard chips.
 */
import type { RawMessage } from "@/lib/reportGrouping";

interface SPCRiskGroup {
  label: string;
  riskLabel: string;
  counties: { county: string; state: string }[];
}

interface SPCHazard {
  hazard: "tornado" | "hail" | "wind";
  maxProb: number;
  significant: boolean;
}

interface SPCPayload {
  v?: number;
  issue: string;
  groups: SPCRiskGroup[];
  summary?: string | null;
  hazards?: SPCHazard[];
  // Retained for legacy payloads only.
  timing?: string | null;
  validWindow?: { startZ: string; endZ: string } | null;
  discussion?: string | null;
}

const DATA_MARKER_RE = /<!--data:([\s\S]*?)-->/;
const ALL_MARKERS_RE = /\s*<!--(?:issue|data):[\s\S]*?-->\s*/g;
const HURRICANE_MARKERS_RE = /\s*<!--(?:htype|hadv):[\s\S]*?-->\s*/g;

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

const RISK_STYLE: Record<string, { fg: string; bg: string; border: string }> = {
  MRGL: { fg: "#7CFC00", bg: "rgba(124,252,0,0.08)", border: "rgba(124,252,0,0.35)" },
  SLGT: { fg: "#FFD700", bg: "rgba(255,215,0,0.08)", border: "rgba(255,215,0,0.35)" },
  ENH: { fg: "#FFA500", bg: "rgba(255,165,0,0.10)", border: "rgba(255,165,0,0.40)" },
  MDT: { fg: "#FF4500", bg: "rgba(255,69,0,0.12)", border: "rgba(255,69,0,0.45)" },
  HIGH: { fg: "#FF1744", bg: "rgba(255,23,68,0.15)", border: "rgba(255,23,68,0.50)" },
};

const HAZARD_LABEL: Record<SPCHazard["hazard"], string> = {
  tornado: "Tornado",
  hail: "Hail",
  wind: "Wind",
};

// Color the hazard chip along the project's amber→red severity ramp. A
// "significant" (hatched) hazard always escalates to the red emergency tone.
function hazardStyle(h: SPCHazard): { fg: string; bg: string; border: string } {
  if (h.significant || h.maxProb >= 30) {
    return { fg: "#FF1744", bg: "rgba(255,23,68,0.12)", border: "rgba(255,23,68,0.45)" };
  }
  if (h.maxProb >= 15) {
    return { fg: "#FF4500", bg: "rgba(255,69,0,0.10)", border: "rgba(255,69,0,0.4)" };
  }
  return { fg: "#FFA500", bg: "rgba(255,165,0,0.08)", border: "rgba(255,165,0,0.35)" };
}

// ─── Fire Weather payload ──────────────────────────────────────────────────
interface FireRiskGroup {
  label: string; // ELEV | CRIT | EXTM | IDRT | SDRT
  riskLabel: string;
  counties: { county: string; state: string }[];
}
interface FireHazard {
  kind: "rh" | "wind" | "fuels" | "dry_thunder";
  label: string;
  value: string;
  severity: "low" | "med" | "high";
}
interface FirePayload {
  v?: number;
  issue: string;
  groups: FireRiskGroup[];
  dryThunder: FireRiskGroup[];
  hazards: FireHazard[];
  summary?: string | null;
  discussion?: string | null;
}

function parseFirePayload(content: string): FirePayload | null {
  const m = content.match(DATA_MARKER_RE);
  if (!m) return null;
  try {
    const p = JSON.parse(m[1]);
    if (!p || (!Array.isArray(p.groups) && !Array.isArray(p.dryThunder))) return null;
    return p as FirePayload;
  } catch { return null; }
}

const FIRE_RISK_STYLE: Record<string, { fg: string; bg: string; border: string }> = {
  ELEV: { fg: "#FFD700", bg: "rgba(255,215,0,0.08)", border: "rgba(255,215,0,0.35)" },
  CRIT: { fg: "#FF8C00", bg: "rgba(255,140,0,0.12)", border: "rgba(255,140,0,0.45)" },
  EXTM: { fg: "#FF1744", bg: "rgba(255,23,68,0.15)", border: "rgba(255,23,68,0.50)" },
  IDRT: { fg: "#FFA500", bg: "rgba(255,165,0,0.08)", border: "rgba(255,165,0,0.35)" },
  SDRT: { fg: "#FF4500", bg: "rgba(255,69,0,0.12)", border: "rgba(255,69,0,0.45)" },
};

function fireHazardStyle(sev: FireHazard["severity"]) {
  if (sev === "high") return { fg: "#FF1744", bg: "rgba(255,23,68,0.12)", border: "rgba(255,23,68,0.45)" };
  if (sev === "med")  return { fg: "#FF8C00", bg: "rgba(255,140,0,0.10)", border: "rgba(255,140,0,0.40)" };
  return { fg: "#FFD700", bg: "rgba(255,215,0,0.08)", border: "rgba(255,215,0,0.35)" };
}

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
  const isFire = message.username === "Fire Weather Bot";
  const payload = isHurricane || isFire ? null : parseSPCPayload(message.content);
  const firePayload = isFire ? parseFirePayload(message.content) : null;
  const stripped = message.content
    .replace(ALL_MARKERS_RE, "")
    .replace(HURRICANE_MARKERS_RE, "")
    .trim();
  const headerLine = stripped.split("\n")[0] ?? (isHurricane ? "Hurricane Bot" : isFire ? "SPC Fire Weather Outlook" : "SPC Day 1 Outlook");

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
          <span className="text-[9px] uppercase tracking-wide font-bold" style={{ color: "#00aaff" }}>
            🌀 Hurricane Bot · System
          </span>
          <span className="text-[9px] opacity-70">
            {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className="whitespace-pre-line opacity-95 leading-snug">{stripped}</p>
      </div>
    );
  }

  if (isFire) {
    const summary = firePayload?.summary ?? null;
    const hazards = firePayload?.hazards ?? [];
    const cat = firePayload?.groups ?? [];
    const dry = firePayload?.dryThunder ?? [];
    const renderGroups = (gs: FireRiskGroup[], suffix: string) => gs.map((g) => {
      const key = `${message.id}::${suffix}::${g.label}`;
      const open = expandedKey.has(key);
      const style = FIRE_RISK_STYLE[g.label] ?? { fg: "#ff9d00", bg: "rgba(255,157,0,0.08)", border: "rgba(255,157,0,0.3)" };
      return (
        <div key={key} className="rounded border overflow-hidden" style={{ borderColor: style.border, background: style.bg }}>
          <button
            type="button"
            onClick={() => toggle(key)}
            className="w-full flex items-center justify-between px-2 py-1 text-left hover:opacity-90 transition-opacity"
            style={{ color: style.fg }}
          >
            <span className="text-[10px] uppercase tracking-wide font-bold">{g.riskLabel}</span>
            <span className="flex items-center gap-1.5 text-[9px] opacity-80">
              <span>{g.counties.length} {g.counties.length === 1 ? "county" : "counties"}</span>
              <span>{open ? "▾" : "▸"}</span>
            </span>
          </button>
          {open && (
            <ul className="px-2 py-1.5 space-y-0.5 border-t text-[10px] max-h-48 overflow-y-auto" style={{ borderColor: style.border, color: style.fg }}>
              {g.counties.map((c, i) => (
                <li key={`${c.state}-${c.county}-${i}`} className="opacity-90">{c.county}, {c.state}</li>
              ))}
            </ul>
          )}
        </div>
      );
    });

    return (
      <div
        className="rounded border px-3 py-2 font-mono text-[11px]"
        style={{
          background: "rgba(255, 80, 0, 0.08)",
          borderColor: "rgba(255, 80, 0, 0.35)",
          color: "#ff8c42",
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[9px] uppercase tracking-wide font-bold" style={{ color: "#ff6b1a" }}>
            🔥 Fire Weather Bot · System
          </span>
          <span className="text-[9px] opacity-70">
            {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className="mb-1.5">{headerLine}</p>

        {summary && (
          <p className="mb-1.5 text-[10px] leading-snug pl-2 border-l" style={{ borderColor: "rgba(255,140,0,0.5)", color: "rgba(255,200,140,0.95)" }}>
            <span className="opacity-70 uppercase tracking-wide mr-1">Expected:</span>
            {summary}
          </p>
        )}

        {hazards.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {hazards.map((h) => {
              const s = fireHazardStyle(h.severity);
              return (
                <span
                  key={h.kind}
                  className="px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wide font-bold"
                  style={{ color: s.fg, background: s.bg, borderColor: s.border }}
                >
                  {h.label} {h.value}
                </span>
              );
            })}
          </div>
        )}

        {cat.length > 0 && (
          <div className="space-y-1 mb-1.5">
            <div className="text-[9px] uppercase tracking-wide opacity-70">Fire Weather Risk</div>
            {renderGroups(cat, "cat")}
          </div>
        )}
        {dry.length > 0 && (
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-wide opacity-70">Dry Thunderstorm</div>
            {renderGroups(dry, "dry")}
          </div>
        )}

        {cat.length === 0 && dry.length === 0 && !firePayload && (
          <p className="whitespace-pre-line opacity-90">{stripped.split("\n").slice(1).join("\n").trim()}</p>
        )}
      </div>
    );
  }

  // Prefer the server-built summary. For legacy rows it may be absent — in
  // that case we just show the second line of the bot's text body, which
  // already contains a usable one-liner.
  const summary = payload?.summary
    ?? (payload ? stripped.split("\n").slice(1).find((l) => l.trim().length > 0)?.trim() ?? null : null);
  const hazards = payload?.hazards ?? [];

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
          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <p className="mb-1.5">{headerLine}</p>

      {summary && (
        <p
          className="mb-1.5 text-[10px] leading-snug pl-2 border-l"
          style={{ borderColor: "rgba(255,165,0,0.4)", color: "rgba(255,200,120,0.95)" }}
        >
          <span className="opacity-70 uppercase tracking-wide mr-1">Expected:</span>
          {summary}
        </p>
      )}

      {hazards.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {hazards.map((h) => {
            const s = hazardStyle(h);
            return (
              <span
                key={h.hazard}
                className="px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wide font-bold"
                style={{ color: s.fg, background: s.bg, borderColor: s.border }}
                title={h.significant ? "Hatched — significant severe risk" : undefined}
              >
                {HAZARD_LABEL[h.hazard]} {h.maxProb > 0 ? `${h.maxProb}%` : ""}
                {h.significant ? " · SIG" : ""}
              </span>
            );
          })}
        </div>
      )}

      {payload ? (
        <div className="space-y-1">
          {payload.groups.map((g) => {
            const key = `${message.id}::${g.label}`;
            const open = expandedKey.has(key);
            const style = RISK_STYLE[g.label] ?? {
              fg: "#ffa500", bg: "rgba(255,165,0,0.08)", border: "rgba(255,165,0,0.3)",
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
                  <span className="text-[10px] uppercase tracking-wide font-bold">{g.riskLabel}</span>
                  <span className="flex items-center gap-1.5 text-[9px] opacity-80">
                    <span>{g.counties.length} {g.counties.length === 1 ? "county" : "counties"}</span>
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
