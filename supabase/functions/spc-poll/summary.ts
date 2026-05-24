// Pure helpers for building the SPC outlook summary. Extracted so we can
// snapshot-test the prose against archived outlook fixtures without booting
// the edge runtime or hitting the network.

export const TIER_RANK: Record<string, number> = {
  MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5,
};
export const TIER_QUALIFIER: Record<string, string> = {
  MRGL: "isolated",
  SLGT: "scattered",
  ENH: "numerous",
  MDT: "widespread",
  HIGH: "significant",
};
export const HAZARD_LABELS: Record<string, string> = {
  tornado: "tornadoes",
  hail: "hail",
  wind: "damaging winds",
};

export interface HazardSummary {
  hazard: "tornado" | "hail" | "wind";
  maxProb: number;
  significant: boolean;
}

export interface RiskGroupLite {
  label: string;
  counties: { state: string }[];
}

interface SPCLikeFeature {
  properties?: Record<string, unknown> | null;
}

// Pull a probability-like value out of a feature. SPC's MapServer publishes
// the probability as `DN` on the prob layers (categorical % bucket) but the
// label is sometimes also numeric in `LABEL`. We accept either and parse
// defensively.
function readProb(p: Record<string, unknown> | null | undefined): number | null {
  if (!p) return null;
  const candidates = [p.DN, p.dn, p.LABEL, p.label, p.PROB, p.prob];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string") {
      const m = c.match(/(\d{1,2})\s*%?/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > 0 && n <= 100) return n;
      }
    }
  }
  return null;
}

function isSignificant(p: Record<string, unknown> | null | undefined): boolean {
  if (!p) return false;
  const candidates = [p.SIGN, p.sign, p.SIG, p.sig];
  for (const c of candidates) {
    if (c === 1 || c === "1" || c === true) return true;
    if (typeof c === "string" && /sig|hatch/i.test(c)) return true;
  }
  // Some SPC layers encode significant rows as LABEL "SIGN" or "10#"-style.
  const label = p.LABEL ?? p.label;
  if (typeof label === "string" && /sig/i.test(label)) return true;
  return false;
}

export function summarizeHazardLayer(
  hazard: HazardSummary["hazard"],
  features: SPCLikeFeature[] | null | undefined,
): HazardSummary | null {
  if (!Array.isArray(features) || features.length === 0) return null;
  let maxProb = 0;
  let sig = false;
  for (const f of features) {
    const prob = readProb(f.properties);
    if (prob !== null && prob > maxProb) maxProb = prob;
    if (isSignificant(f.properties)) sig = true;
  }
  if (maxProb === 0 && !sig) return null;
  return { hazard, maxProb, significant: sig };
}

export function joinList(arr: string[]): string | null {
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
}

export function topStates(groups: RiskGroupLite[], limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const g of groups) for (const c of g.counties ?? []) {
    counts.set(c.state, (counts.get(c.state) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([s]) => s);
}

export function pickHighestTier(groups: RiskGroupLite[]): string | null {
  let best: string | null = null;
  let bestRank = 0;
  for (const g of groups) {
    const r = TIER_RANK[g.label] ?? 0;
    if (r > bestRank) { bestRank = r; best = g.label; }
  }
  return best;
}

const NATURAL_PHRASES = [
  "this morning and afternoon", "this afternoon and evening",
  "this evening and overnight", "late tonight and tomorrow morning",
  "tonight and tomorrow morning", "this afternoon", "this evening",
  "tonight", "overnight", "tomorrow morning", "tomorrow afternoon",
  "late afternoon and evening", "late afternoon", "early morning hours",
  "morning hours", "afternoon hours", "evening hours",
];

export function extractNaturalTime(
  discussion: string | null,
  timing: string | null,
  hasValidWindow: boolean,
): string | null {
  const src = `${discussion ?? ""} ${timing ?? ""}`.toLowerCase();
  for (const p of NATURAL_PHRASES) if (src.includes(p)) return p;
  return hasValidWindow ? "today and tonight" : null;
}

function hazardPhrase(h: HazardSummary): string {
  const noun = HAZARD_LABELS[h.hazard];
  const sigBit = h.significant ? " (significant)" : "";
  if (h.maxProb > 0) return `${h.maxProb}% ${noun}${sigBit}`;
  return `significant ${noun}`;
}

// Build the one-line summary deterministically from structured inputs only.
// No prose scanning, no keyword scoring.
export function buildSummary(input: {
  groups: RiskGroupLite[];
  hazards: HazardSummary[];
  timing: string | null;
  discussion: string | null;
  hasValidWindow: boolean;
}): string {
  const { groups, hazards, timing, discussion, hasValidWindow } = input;
  const region = joinList(topStates(groups));
  const time = extractNaturalTime(discussion, timing, hasValidWindow);
  const tier = pickHighestTier(groups);
  const tierQual = tier ? TIER_QUALIFIER[tier] : null;
  const leadNoun = tierQual
    ? `${tierQual.charAt(0).toUpperCase()}${tierQual.slice(1)} severe thunderstorms`
    : "Severe weather";
  const verb = tier && TIER_RANK[tier] >= 3 ? "expected" : "possible";
  const head = region ? `${leadNoun} ${verb} across ${region}` : `${leadNoun} ${verb}`;
  const headWithTime = time ? `${head} ${time}` : head;
  // Hazards in canonical order, only those SPC actually issued.
  const ORDER = ["tornado", "hail", "wind"] as const;
  const ordered = ORDER
    .map((h) => hazards.find((x) => x.hazard === h))
    .filter((x): x is HazardSummary => !!x);
  const hazardSentence = joinList(ordered.map(hazardPhrase));
  const tail = hazardSentence ? `, with ${hazardSentence}.` : ".";
  return `${headWithTime}${tail}`;
}
