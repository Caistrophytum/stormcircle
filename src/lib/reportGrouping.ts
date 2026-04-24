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
  topic: string;         // display title — content of the first message
  count: number;
  latestTime: string;    // created_at of the most recent message
  badge: string;         // badge of the first reporter
  reports: RawMessage[]; // all individual reports in this stack
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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
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
 * Decide whether `candidate` belongs to the same event as `existing`.
 * Requires at least one specific (location-ish) overlap. Generic overlap
 * adds to the score but cannot match on its own.
 */
function isMatch(candidate: string, existing: string): boolean {
  const ta = tokenize(candidate);
  const tb = tokenize(existing);

  const specificA = ta.filter((w) => !GENERIC_WORDS.has(w));
  const specificB = tb.filter((w) => !GENERIC_WORDS.has(w));
  const genericA = ta.filter((w) => GENERIC_WORDS.has(w));
  const genericB = tb.filter((w) => GENERIC_WORDS.has(w));

  const specificScore = overlap(specificA, specificB);
  const genericScore = overlap(genericA, genericB);

  // Edge case: neither message has any specific (location-ish) tokens
  // (e.g. "test", "hello", or short generic chatter). Fall back to pure
  // token overlap so identical/near-identical messages still stack.
  if (specificA.length === 0 && specificB.length === 0) {
    const tokenScore = overlap(ta, tb);
    const minLen = Math.min(ta.length, tb.length);
    if (minLen === 0) return false;
    // Require most tokens to overlap when there's no location anchor.
    return tokenScore / minLen >= 0.6;
  }

  // Otherwise: require at least one specific (location) overlap. Generic
  // overlap adds to the score but cannot match on its own — this keeps
  // "Hail in Tulsa" from merging with "Power outage in Tulsa".
  if (specificScore === 0) return false;
  if (genericScore === 0 && specificA.length > 0 && specificB.length > 0) return false;

  return specificScore * 3 + genericScore >= 2;
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Group raw messages (oldest → newest) into stacked reports, sorted by count
 * descending then by most-recent activity.
 */
export function groupMessages(messages: RawMessage[]): StackedReport[] {
  const stacks: StackedReport[] = [];

  for (const msg of messages) {
    const match = stacks.find((s) => isMatch(msg.content, s.topic));
    if (match) {
      match.count += 1;
      match.reports.push(msg);
      if (new Date(msg.created_at) > new Date(match.latestTime)) {
        match.latestTime = msg.created_at;
      }
    } else {
      stacks.push({
        id: msg.id,
        topic: msg.content,
        count: 1,
        latestTime: msg.created_at,
        badge: msg.badge,
        reports: [msg],
      });
    }
  }

  return stacks.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime();
  });
}
