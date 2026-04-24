/**
 * reportGrouping — client-side stacking logic for Citizen Reports.
 *
 * Reports are stored individually in Supabase (one row per submission), but
 * the UI groups visually-equivalent reports into a single "stack" so users
 * see "Large Hail in Tulsa (12)" instead of 12 near-duplicate cards.
 *
 * Matching strategy:
 *   1. Tokenize each report; drop GENERIC_WORDS (event/intensity/action terms).
 *   2. The remaining tokens are treated as "specific" (mostly locations).
 *   3. Two reports match when their specific tokens overlap AND their
 *      generic tokens overlap (via the SYNONYMS dictionary).
 *   4. Specific overlap is weighted 3× generic overlap, so location is the
 *      dominant signal — "Funnel cloud in Manhattan" won't merge with
 *      "Funnel Cloud near Baker Field".
 */

export interface RawMessage {
  id: string;
  user_id: string;
  username: string;
  badge: string;
  content: string;
  created_at: string;
}

export interface StackedReport {
  id: string;            // id of the first (oldest) message in the stack
  signature: string;     // stable topic signature (matches SQL message_signature)
  topic: string;         // display title — content of the first message
  count: number;
  latestTime: string;    // created_at of the most recent message
  badge: string;         // badge of the first reporter
  reports: RawMessage[]; // all individual reports in this stack
  approved: boolean;     // computed at render time from approvals set
}

/**
 * Build a stable signature for a message — must match the SQL function
 * `public.message_signature`: lowercase, strip non-alphanumerics, dedupe,
 * sort, and join with "|".
 */
export function messageSignature(content: string): string {
  const tokens = new Set<string>();
  for (const raw of content.toLowerCase().split(/\s+/)) {
    const cleaned = raw.replace(/[^a-z0-9]/g, "");
    if (cleaned.length > 0) tokens.add(cleaned);
  }
  return Array.from(tokens).sort().join("|");
}

/* ── Vocabulary ────────────────────────────────────────────────────────── */

// Words that describe the EVENT, INTENSITY, or ACTION rather than the place.
// These are filtered out before computing "specific" overlap.
const GENERIC_WORDS = new Set<string>([
  // structural / filler
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "near",
  "by", "with", "from", "is", "was", "are", "were", "be", "been", "for",
  "this", "that", "these", "those", "it", "its", "as", "but", "just",
  "now", "very", "really", "some", "any", "all", "report", "reports",
  "spotted", "seen", "observed", "happening", "occurring", "currently",
  // weather phenomena
  "hail", "tornado", "twister", "funnel", "cloud", "wall", "rotation",
  "wedge", "stovepipe", "vortex", "mesocyclone", "supercell", "storm",
  "thunderstorm", "thunder", "lightning", "rain", "downpour", "shower",
  "drizzle", "deluge", "flood", "flooding", "flash", "wind", "winds",
  "gust", "gusts", "gale", "squall", "derecho", "microburst", "downburst",
  "snow", "snowstorm", "blizzard", "graupel", "sleet", "ice", "icy",
  "freezing", "frost", "fog", "mist", "haze", "visibility",
  "power", "outage", "blackout", "lines", "down", "electricity",
  "tree", "trees", "branch", "branches", "fallen", "uprooted",
  "damage", "damaged", "destroyed", "debris", "roof", "roofing",
  "road", "roads", "highway", "hwy", "street", "streets", "impassable",
  "waterlogged", "submerged",
  // intensity / size descriptors
  "large", "big", "huge", "massive", "giant", "great", "extreme",
  "severe", "intense", "heavy", "strong", "violent", "small", "tiny",
  "moderate", "minor", "significant", "chunks", "chunk", "pieces",
  "piece", "stones", "balls", "sized", "size",
  "golfball", "golf", "ball", "baseball", "softball", "marble", "pea",
  "quarter", "nickel", "dime",
  // verbs / actions
  "hitting", "striking", "pounding", "battering", "lashing", "slamming",
  "falling", "coming", "moving", "tracking", "approaching", "incoming",
  "rolling", "passing", "sweeping", "dumping",
]);

// Synonym groups — every word in a group is treated as the same token.
const SYNONYMS: string[][] = [
  // Cities / regions
  ["okc", "oklahoma", "oklahomacity"],
  ["nyc", "newyork", "manhattan", "manhatten"],
  ["dfw", "dallas", "fortworth", "ftworth"],
  ["la", "losangeles"],
  ["sf", "sanfrancisco"],
  // Tornado family
  ["tornado", "twister", "rotation", "wedge", "stovepipe", "vortex", "funnel"],
  // Hail family
  ["hail", "hailstone", "hailstones", "chunks", "stones", "balls"],
  // Wind family
  ["wind", "winds", "gust", "gusts", "gale", "squall", "derecho", "microburst", "downburst"],
  // Rain / flood family
  ["rain", "downpour", "deluge", "shower", "drizzle"],
  ["flood", "flooding", "flash", "waterlogged", "submerged"],
  // Snow / ice family
  ["snow", "snowstorm", "blizzard", "graupel", "sleet"],
  ["ice", "icy", "freezing", "frost"],
  // Lightning / thunder
  ["lightning", "thunder", "thunderstorm", "storm"],
  // Visibility
  ["fog", "mist", "haze"],
  // Infrastructure / power
  ["power", "outage", "blackout", "electricity", "lines"],
  ["tree", "trees", "branch", "branches", "fallen", "uprooted"],
  ["road", "roads", "highway", "hwy", "street", "streets", "impassable"],
  // Intensity / size
  ["large", "massive", "huge", "giant", "big", "great", "significant", "extreme"],
  ["small", "tiny", "minor"],
  // Action / impact
  ["hitting", "striking", "pounding", "battering", "lashing", "slamming", "falling"],
];

const WORD_TO_GROUP = new Map<string, Set<string>>();
for (const group of SYNONYMS) {
  const set = new Set(group);
  for (const word of group) WORD_TO_GROUP.set(word, set);
}

/* ── Tokenization & matching ───────────────────────────────────────────── */

interface TokenAnalysis {
  tokens: string[];
  specific: string[];
  generic: string[];
}

// Cache token analysis per unique string so repeated grouping passes don't
// re-tokenize. Bounded to avoid unbounded growth across long sessions.
const tokenCache = new Map<string, TokenAnalysis>();
const TOKEN_CACHE_MAX = 2000;

function analyze(text: string): TokenAnalysis {
  const cached = tokenCache.get(text);
  if (cached) return cached;

  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const specific: string[] = [];
  const generic: string[] = [];
  for (const t of tokens) {
    if (GENERIC_WORDS.has(t)) generic.push(t);
    else specific.push(t);
  }
  const result: TokenAnalysis = { tokens, specific, generic };

  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    // Evict oldest entry (Map preserves insertion order).
    const firstKey = tokenCache.keys().next().value;
    if (firstKey !== undefined) tokenCache.delete(firstKey);
  }
  tokenCache.set(text, result);
  return result;
}

function getGroup(word: string): Set<string> | null {
  return WORD_TO_GROUP.get(word) ?? null;
}

/** Two tokens match if equal, share a synonym group, or one contains the other. */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const ga = getGroup(a);
  if (ga && ga.has(b)) return true;
  const gb = getGroup(b);
  if (gb && gb.has(a)) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

/** Count overlapping words between two token lists using wordsMatch. */
function overlap(a: string[], b: string[]): number {
  let count = 0;
  for (const wa of a) {
    if (b.some((wb) => wordsMatch(wa, wb))) count++;
  }
  return count;
}

/**
 * Decide whether two pre-analyzed messages belong to the same event.
 * Requires at least one specific (location-ish) overlap. Generic overlap
 * adds to the score but cannot match on its own.
 */
function isMatchAnalyzed(a: TokenAnalysis, b: TokenAnalysis): boolean {
  // Edge case: neither side has specific tokens (e.g. "test", "hello").
  // Fall back to pure token overlap so identical chatter still stacks.
  if (a.specific.length === 0 && b.specific.length === 0) {
    const tokenScore = overlap(a.tokens, b.tokens);
    const minLen = Math.min(a.tokens.length, b.tokens.length);
    if (minLen === 0) return false;
    return tokenScore / minLen >= 0.6;
  }

  const specificScore = overlap(a.specific, b.specific);
  if (specificScore === 0) return false;

  const genericScore = overlap(a.generic, b.generic);
  if (genericScore === 0 && a.specific.length > 0 && b.specific.length > 0) return false;

  return specificScore * 3 + genericScore >= 2;
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Group raw messages (oldest → newest) into stacked reports.
 *
 * Sort priority (top → bottom):
 *   1. Approved + many reports     (count desc)
 *   2. Approved (any count)        (count desc)
 *   3. Unapproved + many reports   (count desc)
 *   4. Unapproved                  (count desc)
 *   — within ties: most-recent activity first.
 *
 * "Many reports" threshold = 3 (a stack with 3+ submissions is considered
 * trending and outranks single approved messages only when also approved).
 */
const TRENDING_THRESHOLD = 3;

export function groupMessages(
  messages: RawMessage[],
  approvedSignatures: Set<string> = new Set(),
): StackedReport[] {
  // Carry pre-computed analysis on each stack to avoid re-tokenizing the
  // topic for every incoming message.
  type WorkingStack = StackedReport & { _analysis: TokenAnalysis };
  const stacks: WorkingStack[] = [];

  for (const msg of messages) {
    const a = analyze(msg.content);
    let match: WorkingStack | undefined;
    for (const s of stacks) {
      if (isMatchAnalyzed(a, s._analysis)) {
        match = s;
        break;
      }
    }
    if (match) {
      match.count += 1;
      match.reports.push(msg);
      if (new Date(msg.created_at) > new Date(match.latestTime)) {
        match.latestTime = msg.created_at;
      }
    } else {
      const sig = messageSignature(msg.content);
      stacks.push({
        id: msg.id,
        signature: sig,
        topic: msg.content,
        count: 1,
        latestTime: msg.created_at,
        badge: msg.badge,
        reports: [msg],
        approved: approvedSignatures.has(sig),
        _analysis: a,
      });
    }
  }

  // Re-evaluate approval after stacks are built (sig is set on first msg).
  for (const s of stacks) s.approved = approvedSignatures.has(s.signature);

  function tier(s: StackedReport): number {
    const trending = s.count >= TRENDING_THRESHOLD;
    if (s.approved && trending) return 0;
    if (s.approved) return 1;
    if (trending) return 2;
    return 3;
  }

  return stacks.sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    if (b.count !== a.count) return b.count - a.count;
    return new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime();
  });
}
