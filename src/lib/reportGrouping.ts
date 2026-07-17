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
function messageSignature(content: string): string {
  const tokens = new Set<string>();
  for (const raw of content.toLowerCase().split(/\s+/)) {
    const cleaned = raw.replace(/[^a-z0-9]/g, "");
    if (cleaned.length > 0) tokens.add(cleaned);
  }
  return Array.from(tokens).sort().join("|");
}

/* ── Vocabulary ────────────────────────────────────────────────────────── */

// Pure structural / filler words — not meteorological signal, not a location.
// Their presence (alone) does NOT mark a message as weather-related.
const FILLER_WORDS = new Set<string>([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "near",
  "by", "with", "from", "is", "was", "are", "were", "be", "been", "for",
  "this", "that", "these", "those", "it", "its", "as", "but", "just",
  "now", "very", "really", "some", "any", "all", "report", "reports",
  "spotted", "seen", "observed", "happening", "occurring", "currently",
]);

// Meteorological generic vocabulary — weather phenomena, impact terms,
// intensity descriptors, and action verbs that describe weather events.
// A message containing ANY of these (or any place / synonym-group word)
// is classified as meteorological. Everything else falls through to the
// shared "General" stack.
const METEO_WORDS = new Set<string>([
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

// Words filtered out when computing "specific" (location-ish) overlap.
// Includes both pure fillers AND meteorological generics.
const GENERIC_WORDS = new Set<string>([...FILLER_WORDS, ...METEO_WORDS]);

// Multi-word place names that collapse to a single token before tokenization,
// so they can be aliased via SYNONYMS (e.g. "new jersey" → "newjersey" → "nj").
// Sorted longest-first so multi-word phrases match before their substrings.
const MULTIWORD_PHRASES: string[] = [
  // States
  "new hampshire", "new jersey", "new mexico", "new york state", "new york",
  "north carolina", "north dakota", "rhode island", "south carolina",
  "south dakota", "west virginia", "washington dc", "washington d c",
  // Cities
  "oklahoma city", "new york city", "fort worth", "ft worth",
  "los angeles", "san francisco", "san antonio", "san diego", "san jose",
  "saint louis", "st louis", "saint paul", "st paul", "twin cities",
  "salt lake city", "kansas city", "las vegas", "new orleans",
].sort((a, b) => b.length - a.length);

// Synonym groups — every word in a group is treated as the same token.
// Add new aliases here when you notice the chat splitting equivalent
// place names (e.g. "NJ" vs "New Jersey", "St. Louis" vs "Saint Louis").
const SYNONYMS: string[][] = [
  // ── US states (abbrev ↔ full name; multi-word names collapse to one token
  //    because tokenization strips whitespace/punctuation, so "New Jersey" →
  //    "newjersey").
  ["al", "alabama"],
  ["ak", "alaska"],
  ["az", "arizona"],
  ["ar", "arkansas"],
  ["ca", "california", "calif"],
  ["co", "colorado"],
  ["ct", "connecticut", "conn"],
  ["de", "delaware"],
  ["fl", "florida", "fla"],
  ["ga", "georgia"],
  ["hi", "hawaii"],
  ["id", "idaho"],
  ["il", "illinois", "ill"],
  ["in", "indiana", "ind"],
  ["ia", "iowa"],
  ["ks", "kansas", "kan"],
  ["ky", "kentucky"],
  ["la", "louisiana"], // NB: also matches "LA" the city — see city group below.
  ["me", "maine"],
  ["md", "maryland"],
  ["ma", "massachusetts", "mass"],
  ["mi", "michigan", "mich"],
  ["mn", "minnesota", "minn"],
  ["ms", "mississippi", "miss"],
  ["mo", "missouri"],
  ["mt", "montana", "mont"],
  ["ne", "nebraska", "nebr"],
  ["nv", "nevada"],
  ["nh", "newhampshire"],
  ["nj", "newjersey"],
  ["nm", "newmexico"],
  ["ny", "newyorkstate"], // state abbreviation; NYC handled in city group
  ["nc", "northcarolina"],
  ["nd", "northdakota"],
  ["oh", "ohio"],
  ["ok", "oklahoma", "okla"],
  ["or", "oregon", "ore"],
  ["pa", "pennsylvania", "penn"],
  ["ri", "rhodeisland"],
  ["sc", "southcarolina"],
  ["sd", "southdakota"],
  ["tn", "tennessee", "tenn"],
  ["tx", "texas", "tex"],
  ["ut", "utah"],
  ["vt", "vermont"],
  ["va", "virginia"],
  ["wa", "washington", "wash"], // state; "DC" handled separately
  ["wv", "westvirginia"],
  ["wi", "wisconsin", "wisc"],
  ["wy", "wyoming"],
  ["dc", "washingtondc"],

  // ── Major US cities (abbrev / nickname ↔ canonical)
  ["okc", "oklahomacity"],
  ["nyc", "newyorkcity", "newyork", "manhattan", "manhatten", "brooklyn", "bronx", "queens"],
  ["dfw", "dallas", "fortworth", "ftworth"],
  ["la", "losangeles", "lax"],
  ["sf", "sanfrancisco", "frisco"],
  ["chi", "chicago", "chitown"],
  ["philly", "philadelphia"],
  ["nola", "neworleans"],
  ["vegas", "lasvegas"],
  ["atl", "atlanta"],
  ["bos", "boston"],
  ["sea", "seattle"],
  ["pdx", "portland"],
  ["mia", "miami"],
  ["hou", "houston"],
  ["sa", "sanantonio"],
  ["sd", "sandiego"], // overlaps SD/South Dakota — context (other tokens) disambiguates
  ["sj", "sanjose"],
  ["det", "detroit"],
  ["msp", "minneapolis", "stpaul", "saintpaul", "twincities"],
  ["stl", "stlouis", "saintlouis"],
  ["kc", "kansascity"],
  ["pit", "pittsburgh"],
  ["clt", "charlotte"],
  ["rdu", "raleigh", "durham"],
  ["jax", "jacksonville"],
  ["tpa", "tampa"],
  ["orl", "orlando"],
  ["abq", "albuquerque"],
  ["slc", "saltlakecity"],
  ["den", "denver"],
  ["phx", "phoenix"],
  ["tus", "tucson"],
  ["ind", "indianapolis", "indy"],
  ["mke", "milwaukee"],
  ["cle", "cleveland"],
  ["cin", "cincinnati", "cincy"],
  ["col", "columbus"],
  ["nash", "nashville"],
  ["mem", "memphis"],
  ["bham", "birmingham"],
  ["ral", "raleigh"],

  // ── Tornado family
  ["tornado", "twister", "rotation", "wedge", "stovepipe", "vortex", "funnel"],
  // ── Hail family
  ["hail", "hailstone", "hailstones", "chunks", "stones", "balls"],
  // ── Wind family
  ["wind", "winds", "gust", "gusts", "gale", "squall", "derecho", "microburst", "downburst"],
  // ── Rain / flood family
  ["rain", "downpour", "deluge", "shower", "drizzle"],
  ["flood", "flooding", "flash", "waterlogged", "submerged"],
  // ── Snow / ice family
  ["snow", "snowstorm", "blizzard", "graupel", "sleet"],
  ["ice", "icy", "freezing", "frost"],
  // ── Lightning / thunder
  ["lightning", "thunder", "thunderstorm", "storm"],
  // ── Visibility
  ["fog", "mist", "haze"],
  // ── Infrastructure / power
  ["power", "outage", "blackout", "electricity", "lines"],
  ["tree", "trees", "branch", "branches", "fallen", "uprooted"],
  ["road", "roads", "highway", "hwy", "street", "streets", "impassable"],
  // ── Intensity / size
  ["large", "massive", "huge", "giant", "big", "great", "significant", "extreme"],
  ["small", "tiny", "minor"],
  // ── Action / impact
  ["hitting", "striking", "pounding", "battering", "lashing", "slamming", "falling"],
];

// A single word can belong to multiple synonym groups (e.g. "la" is both
// Louisiana and Los Angeles, "sd" is both South Dakota and San Diego).
// We merge all groups that contain a given word so wordsMatch() treats any
// of those aliases as equivalent. Disambiguation in practice comes from the
// other tokens in the message (state names rarely co-occur with city names).
const WORD_TO_GROUP = new Map<string, Set<string>>();
for (const group of SYNONYMS) {
  for (const word of group) {
    const existing = WORD_TO_GROUP.get(word);
    if (existing) {
      for (const w of group) existing.add(w);
    } else {
      WORD_TO_GROUP.set(word, new Set(group));
    }
  }
}
// Second pass: ensure every word in a merged set points to the same Set
// instance, so updates above are reflected for all members.
for (const [, set] of WORD_TO_GROUP) {
  for (const w of set) WORD_TO_GROUP.set(w, set);
}

/* ── Tokenization & matching ───────────────────────────────────────────── */

interface TokenAnalysis {
  tokens: string[];
  specific: string[];
  generic: string[];
  /** True when at least one token is meteorological vocabulary
   *  (weather phenomenon, weather-related action/intensity, or a known
   *  place from the SYNONYMS table). Messages without ANY such token
   *  fall through to the shared "General" stack. */
  isMeteorological: boolean;
}

// Common greetings should stay in General even if they collide with a state
// abbreviation like "HI" for Hawaii.
const GENERAL_CHAT_EXACT_WORDS = new Set<string>(["hi"]);

// Cache token analysis per unique string so repeated grouping passes don't
// re-tokenize. Bounded to avoid unbounded growth across long sessions.
const tokenCache = new Map<string, TokenAnalysis>();
const TOKEN_CACHE_MAX = 2000;

/** True if `word` is part of the meteorological vocabulary — any
 *  weather-related generic OR any word in a synonym group (places +
 *  weather families). */
function isMeteoToken(word: string): boolean {
  return METEO_WORDS.has(word) || WORD_TO_GROUP.has(word);
}

function analyze(text: string): TokenAnalysis {
  const cached = tokenCache.get(text);
  if (cached) return cached;

  // Collapse known multi-word place names to a single token BEFORE
  // tokenization, so "New Jersey" → "newjersey" (which then matches "nj"
  // via the synonym table). Order matters: longer phrases first to avoid
  // greedy partial matches.
  let normalized = text.toLowerCase();
  for (const phrase of MULTIWORD_PHRASES) {
    // word-boundary, allow any whitespace between parts
    const pattern = new RegExp(
      `\\b${phrase.split(" ").join("\\s+")}\\b`,
      "g",
    );
    normalized = normalized.replace(pattern, phrase.replace(/\s+/g, ""));
  }

  const tokens = normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 1 && GENERAL_CHAT_EXACT_WORDS.has(tokens[0])) {
    const result: TokenAnalysis = {
      tokens,
      specific: tokens,
      generic: [],
      isMeteorological: false,
    };

    if (tokenCache.size >= TOKEN_CACHE_MAX) {
      const firstKey = tokenCache.keys().next().value;
      if (firstKey !== undefined) tokenCache.delete(firstKey);
    }
    tokenCache.set(text, result);
    return result;
  }

  const specific: string[] = [];
  const generic: string[] = [];
  let isMeteorological = false;
  for (const t of tokens) {
    if (GENERIC_WORDS.has(t)) generic.push(t);
    else specific.push(t);
    if (!isMeteorological && isMeteoToken(t)) isMeteorological = true;
  }
  const result: TokenAnalysis = { tokens, specific, generic, isMeteorological };

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

  // Stable signature for the catch-all "General" stack. Any non-meteorological
  // message lands here regardless of its words, so all such chatter shares
  // a single visible group.
  const GENERAL_SIGNATURE = "__general__";
  let generalStack: WorkingStack | undefined;

  for (const msg of messages) {
    const a = analyze(msg.content);

    // Non-meteorological → route to the shared General stack (creating it
    // on first occurrence).
    if (!a.isMeteorological) {
      if (!generalStack) {
        generalStack = {
          id: msg.id,
          signature: GENERAL_SIGNATURE,
          topic: "General Chatbox",
          count: 1,
          latestTime: msg.created_at,
          badge: msg.badge,
          reports: [msg],
          approved: approvedSignatures.has(GENERAL_SIGNATURE),
          _analysis: a,
        };
        stacks.push(generalStack);
      } else {
        generalStack.count += 1;
        generalStack.reports.push(msg);
        if (new Date(msg.created_at) > new Date(generalStack.latestTime)) {
          generalStack.latestTime = msg.created_at;
        }
      }
      continue;
    }

    let match: WorkingStack | undefined;
    for (const s of stacks) {
      if (s.signature === GENERAL_SIGNATURE) continue; // never merge into General
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

  // The General Chatbox is a catch-all and not a single event, so its
  // individual messages should read newest-first instead of chronological.
  if (generalStack) {
    generalStack.reports.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

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
