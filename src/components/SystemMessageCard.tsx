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
  discussion?: string | null;
  summary?: string | null;
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
  // Hurricane Bot rows use a separate marker family (<!--htype:--> and
  // <!--hadv:-->) and don't carry the SPC payload. We render them in a
  // distinct teal/blue card so users can tell tropical and severe-weather
  // advisories apart at a glance.
  const isHurricane = message.username === "Hurricane Bot";
  const payload = isHurricane ? null : parseSPCPayload(message.content);
  const [fallbackTiming, setFallbackTiming] = useState<string | null>(null);
  const [fallbackValidWindow, setFallbackValidWindow] = useState<SPCPayload["validWindow"]>(null);
  // Strip both SPC outlook markers AND Hurricane Bot markers so the visible
  // body never leaks the embedded HTML-comment metadata.
  const HURRICANE_MARKERS_RE = /\s*<!--(?:htype|hadv):[\s\S]*?-->\s*/g;
  const stripped = message.content
    .replace(ALL_MARKERS_RE, "")
    .replace(HURRICANE_MARKERS_RE, "")
    .trim();
  const headerLine = stripped.split("\n")[0] ?? (isHurricane ? "Hurricane Bot" : "SPC Day 1 Outlook");

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

  // ── Hurricane Bot variant ─────────────────────────────────────────
  // Renders the cleaned plain-text body (markers stripped above) inside a
  // teal/blue glass card. We intentionally early-return AFTER the SPC
  // fallback-timing useEffect above so hook order stays stable across
  // re-renders (the effect short-circuits when `payload` is null).
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

  const visibleTiming = payload?.timing ?? fallbackTiming;
  const visibleValidWindow = payload?.validWindow ?? fallbackValidWindow;
  const visibleDiscussion = payload?.discussion ?? payload?.timing ?? fallbackTiming;

  // Compact summary chips for the "Expected" line. We prefer a Z-time range
  // parsed out of the discussion sentence, fall back to the official VALID
  // window. Places are derived from the union of risk-polygon counties (top
  // states by coverage), threats are keyword-matched from the discussion.

  const expectedTime = (() => {
    // Prefer a natural phrase ("this afternoon and evening", "overnight",
    // etc.) pulled from the discussion / timing text. Z-times are unfamiliar
    // to most readers, so we only fall back to a coarse "today and tonight"
    // when no natural cue is present.
    const naturalSource = `${visibleDiscussion ?? ""} ${visibleTiming ?? ""}`.toLowerCase();
    const NATURAL_PHRASES = [
      "this morning and afternoon", "this afternoon and evening",
      "this evening and overnight", "late tonight and tomorrow morning",
      "tonight and tomorrow morning", "this afternoon", "this evening",
      "tonight", "overnight", "tomorrow morning", "tomorrow afternoon",
      "late afternoon and evening", "late afternoon", "early morning hours",
      "morning hours", "afternoon hours", "evening hours",
    ];
    for (const p of NATURAL_PHRASES) {
      if (naturalSource.includes(p)) return p;
    }
    if (visibleValidWindow) return "today and tonight";
    return null;
  })();

  const topStates: string[] = (() => {
    if (!payload) return [];
    const counts = new Map<string, number>();
    for (const g of payload.groups) {
      for (const c of g.counties) counts.set(c.state, (counts.get(c.state) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s]) => s);
  })();

  // Tier drives the coverage/intensity qualifier. The SPC convention:
  //   MRGL = isolated, SLGT = scattered, ENH = numerous,
  //   MDT  = widespread, HIGH = significant/outbreak.
  // We previously scanned the free-form discussion for words like
  // "significant" / "strong", which produced false positives (e.g. on a
  // MRGL-only day the fallback fetch of the full SPC outlook text contains
  // those words in unrelated paragraphs). Anchoring the qualifier to the
  // highest active tier is both safer and more meteorologically correct.
  const TIER_RANK: Record<string, number> = { MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5 };
  const TIER_QUALIFIER: Record<string, string> = {
    MRGL: "isolated",
    SLGT: "scattered",
    ENH: "numerous",
    MDT: "widespread",
    HIGH: "significant",
  };
  const highestTier: string | null = (() => {
    if (!payload) return null;
    let best: string | null = null;
    let bestRank = 0;
    for (const g of payload.groups) {
      const r = TIER_RANK[g.label] ?? 0;
      if (r > bestRank) { bestRank = r; best = g.label; }
    }
    return best;
  })();
  const tierQualifier = highestTier ? TIER_QUALIFIER[highestTier] : null;

  // Per-threat detection: only enumerate a hazard when the SPC discussion
  // sentence from the structured payload (NOT the fallback full-outlook
  // text) explicitly calls it out. The fallback text mentions every hazard
  // somewhere and produced spurious "hail, winds, tornadoes" claims on
  // days SPC didn't single any of them out.
  type ThreatLine = { hazard: string; area: string | null };
  const US_STATES = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
  const REGION_RE = new RegExp(`\\b(?:${US_STATES}|Plains|Midwest|Mid-?South|Mid-?Atlantic|Ohio Valley|Tennessee Valley|Mississippi Valley|Missouri Valley|Southeast|Northeast|Southwest|Northwest|Gulf Coast|Carolinas|Deep South|Great Lakes|High Plains|Southern Plains|Central Plains|Northern Plains)\\b`, "g");
  const threatLines: ThreatLine[] = (() => {
    const trusted = payload?.discussion ?? payload?.timing ?? null;
    if (!trusted) return [];
    const hazards: { hazard: string; re: RegExp }[] = [
      { hazard: "tornadoes", re: /\btornado(?:es|ic)?\b/i },
      { hazard: "hail", re: /\bhail\b/i },
      { hazard: "damaging winds", re: /\b(?:damaging winds?|severe winds?|wind damage|damaging gusts?)\b/i },
    ];
    const clauses = trusted.split(/[.;]|,\s+(?=[A-Z])/).map((c) => c.trim()).filter(Boolean);
    const findArea = (clause: string): string | null => {
      const matches = clause.match(REGION_RE);
      if (!matches?.length) return null;
      return [...new Set(matches)].slice(0, 3).join(", ");
    };
    const out: ThreatLine[] = [];
    for (const { hazard, re } of hazards) {
      const hits = clauses.filter((c) => re.test(c));
      if (hits.length === 0) continue;
      const area = hits.map(findArea).find(Boolean) ?? null;
      out.push({ hazard, area });
    }
    return out;
  })();

  // Synthesize a short prose summary. Tier sets the coverage qualifier;
  // hazards are only enumerated when SPC explicitly called them out.
  const expectedSentence: string | null = (() => {
    if (!payload) return null;
    if (payload.summary) return payload.summary;

    const joinList = (arr: string[]) =>
      arr.length === 0 ? null
        : arr.length === 1 ? arr[0]
        : arr.length === 2 ? `${arr[0]} and ${arr[1]}`
        : `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;

    const region = joinList(topStates);
    const time = expectedTime ?? null;

    const HAZARD_ORDER = ["tornadoes", "hail", "damaging winds"];
    const sortedThreats = [...threatLines].sort(
      (a, b) => HAZARD_ORDER.indexOf(a.hazard) - HAZARD_ORDER.indexOf(b.hazard),
    );
    const hazardPhrases = sortedThreats.map((t) =>
      t.area ? `${t.hazard} across ${t.area}` : t.hazard,
    );
    const hazardSentence = joinList(hazardPhrases);

    // Lead noun reflects tier so coverage stays meteorologically honest.
    // On MRGL-only days we say "Isolated severe thunderstorms possible",
    // never "significant" or "widespread".
    const leadNoun = tierQualifier
      ? `${tierQualifier.charAt(0).toUpperCase()}${tierQualifier.slice(1)} severe thunderstorms`
      : "Severe weather";
    const verb = highestTier && TIER_RANK[highestTier] >= 3 ? "expected" : "possible";
    const head = region ? `${leadNoun} ${verb} across ${region}` : `${leadNoun} ${verb}`;
    const headWithTime = time ? `${head} ${time}` : head;
    const tail = hazardSentence ? `, with ${hazardSentence} the main threats.` : ".";
    return `${headWithTime}${tail}`;
  })();


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

      {/* Short prose summary — dominant risk tier, regions, time window,
          and headline threats. Synthesized from structured data; no raw
          county counts or other dry metrics leak through. */}
      {expectedSentence && (
        <p
          className="mb-1.5 text-[10px] leading-snug pl-2 border-l"
          style={{
            borderColor: "rgba(255,165,0,0.4)",
            color: "rgba(255,200,120,0.95)",
          }}
        >
          <span className="opacity-70 uppercase tracking-wide mr-1">Expected:</span>
          {expectedSentence}
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
