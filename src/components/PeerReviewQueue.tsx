import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, CheckCircle2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SingleReport {
  id: string;
  text: string;
  username: string;
  time: string;
}

interface StackedReport {
  id: string;
  topic: string;
  count: number;
  latestTime: string;
  type: "REPORT" | "VISUAL" | "DATA";
  reports: SingleReport[];
}

const randomUser = () => {
  const names = ["WX_HUNTER", "STORM_J", "SKY_OBS", "METEO_K", "CIT_WATCH", "RADAR_FAN", "CHASE_99", "HAIL_RPT", "WIND_EYE", "OKC_WX"];
  return names[Math.floor(Math.random() * names.length)];
};

function generateMockReports(topic: string, count: number): SingleReport[] {
  const times = ["1m ago", "2m ago", "4m ago", "6m ago", "10m ago", "15m ago", "22m ago", "30m ago"];
  const variants: Record<string, string[]> = {
    "Large Hail In Tulsa": [
      "Golf ball sized hail hitting downtown Tulsa right now!",
      "Hail breaking car windshields on 71st street",
      "Quarter size hail near Tulsa Hills",
      "Massive hail stones falling in midtown Tulsa",
      "Hail damage on rooftops across south Tulsa",
    ],
    "Funnel Cloud Near Baker Field": [
      "Rotating wall cloud spotted over Baker Field",
      "Possible funnel forming near Baker Field area",
      "Funnel cloud visible from Hwy 9 looking toward Baker",
      "Confirmed rotation near Baker Field — stay alert",
    ],
    "Flash Flooding On Hwy 42": [
      "Water over the road on Hwy 42 near mile marker 8",
      "Cars stalled in floodwater on Highway 42",
      "Flash flooding — Hwy 42 impassable westbound",
      "Rapid water rise on 42, avoid the area",
    ],
    "Power Outage Downtown OKC": [
      "Entire block dark on NW 10th and Broadway",
      "Power lines down near Oklahoma City downtown",
      "No electricity since the storm hit OKC",
      "Traffic lights out at several OKC intersections",
    ],
    "Debris On I-44 Eastbound": [
      "Tree limbs blocking right lane I-44 east",
      "Debris scattered across I-44 near turnpike exit",
      "Metal roofing on I-44 eastbound — drive careful",
    ],
    "Barometric Drop Station Delta": [
      "Pressure dropping fast at Station Delta — 4.2 hPa in 15 min",
      "Barometer falling rapidly, Station Delta readings anomalous",
    ],
  };
  const texts = variants[topic] || [`Report about ${topic}`];
  return Array.from({ length: Math.min(count, 8) }, (_, i) => ({
    id: `${topic}-${i}`,
    text: texts[i % texts.length],
    username: randomUser(),
    time: times[i % times.length],
  }));
}

const initialReports: StackedReport[] = [
  {
    id: "demo-citizen-1",
    topic: "Large Hail In Tulsa",
    count: 1,
    latestTime: "2m ago",
    type: "REPORT",
    reports: [
      {
        id: "demo-citizen-1-r1",
        text: "Quarter-sized hail coming down hard near 71st and Memorial in Tulsa right now!",
        username: "STORM_J",
        time: "2m ago",
      },
    ],
  },
];

const typeColors: Record<string, string> = {
  REPORT: "bg-primary/20 text-primary border-primary/30",
  VISUAL: "bg-accent/20 text-accent-foreground border-accent/30",
  DATA: "bg-secondary text-secondary-foreground border-border",
};

// Common weather/descriptive terms that should NOT drive matching on their own
const GENERIC_WORDS = new Set([
  // Precipitation
  "cloud", "funnel", "hail", "rain", "sleet", "snow", "ice", "freezing",
  "drizzle", "downpour", "shower", "pelting", "precipitation", "graupel",
  "hailstorm", "hailstone", "hailstones", "icy", "wintry",
  // Wind
  "wind", "gust", "gale", "breeze", "squall", "derecho", "microburst",
  "downburst", "windshear", "crosswind", "headwind", "tailwind", "blowing",
  // Storms
  "storm", "thunder", "thunderstorm", "supercell", "mesocyclone",
  "lightning", "tstorm", "cell", "convection", "convective",
  // Tornado
  "tornado", "twister", "cyclone", "rotation", "vortex", "waterspout",
  "landspout", "gustnado", "wedge", "stovepipe", "rope",
  // Flooding
  "flood", "flooding", "flash", "inundation", "surge", "overflow",
  "waterlogged", "submerged", "swamped", "underwater",
  // Visibility
  "fog", "mist", "haze", "visibility", "whiteout", "blackout", "obscured",
  // Infrastructure
  "debris", "power", "outage", "damage", "destruction", "collapse",
  "down", "lines", "downed", "fallen", "blocked", "impassable",
  // Intensity descriptors
  "large", "massive", "huge", "giant", "big", "small", "moderate",
  "severe", "extreme", "intense", "major", "minor", "significant",
  "catastrophic", "devastating", "dangerous", "deadly", "violent",
  "great", "chunks", "pieces", "stones", "balls", "sized",
  "strong", "heavy", "thick", "dense", "light", "weak", "powerful",
  // Action words
  "hitting", "falling", "struck", "pounding", "damaging", "approaching",
  "moving", "tracking", "spotted", "confirmed", "reported", "observed",
  "sighted", "warning", "alert", "watch", "advisory", "emergency",
  // Misc
  "report", "near", "the", "area", "region", "zone", "sector",
  "drop", "station", "ball", "golf", "baseball", "softball", "quarter",
  "dime", "nickel", "penny", "marble", "egg", "grapefruit",
  // Temperature
  "cold", "hot", "warm", "cool", "freezing", "frigid", "scorching",
  "heat", "heatwave", "coldfront", "warmfront",
  // Barometric
  "barometric", "pressure", "barometer", "millibar", "hectopascal",
]);

const SYNONYMS: string[][] = [
  // Locations / abbreviations
  ["okc", "oklahoma", "oklahomacity"],
  ["hwy", "highway", "freeway", "interstate", "road", "route"],
  ["tulsa"],
  ["manhattan"],
  ["baker", "bakerfield"],
  ["downtown", "city", "urban", "metro"],

  // Major US cities + abbreviations / nicknames
  ["nyc", "newyork", "newyorkcity", "manhattan", "bigapple", "ny"],
  ["la", "losangeles", "cityofangels"],
  ["sf", "sanfrancisco", "frisco", "sanfran", "bayarea"],
  ["chi", "chicago", "chitown", "windycity"],
  ["philly", "philadelphia", "phila"],
  ["dc", "washington", "washingtondc"],
  ["vegas", "lasvegas", "lv", "sincity"],
  ["nola", "neworleans", "bigeasy"],
  ["atl", "atlanta"],
  ["bos", "boston", "beantown"],
  ["sd", "sandiego"],
  ["sea", "seattle", "emeraldcity"],
  ["pdx", "portland"],
  ["phx", "phoenix", "valleyofthesun"],
  ["dfw", "dallas", "fortworth", "ftworth"],
  ["hou", "houston", "htown", "spacecity"],
  ["sat", "sanantonio"],
  ["aus", "austin"],
  ["mia", "miami", "magiccity"],
  ["jax", "jacksonville"],
  ["tpa", "tampa"],
  ["orl", "orlando"],
  ["den", "denver", "milehighcity", "milehigh"],
  ["slc", "saltlake", "saltlakecity"],
  ["msp", "minneapolis", "stpaul", "saintpaul", "twincities"],
  ["mke", "milwaukee"],
  ["det", "detroit", "motown", "motorcity"],
  ["cle", "cleveland"],
  ["cin", "cincinnati", "cincy"],
  ["col", "columbus"],
  ["pit", "pittsburgh"],
  ["bal", "baltimore", "bmore", "charmcity"],
  ["clt", "charlotte", "queencity"],
  ["ral", "raleigh"],
  ["nash", "nashville", "musiccity"],
  ["mem", "memphis"],
  ["lou", "louisville"],
  ["ind", "indianapolis", "indy"],
  ["stl", "stlouis", "saintlouis", "gatewaycity"],
  ["kc", "kansascity", "kcmo"],
  ["omaha"],
  ["abq", "albuquerque"],
  ["elp", "elpaso"],
  ["sac", "sacramento"],
  ["sj", "sanjose"],
  ["fres", "fresno"],
  ["oak", "oakland"],
  ["lb", "longbeach"],
  ["bham", "birmingham"],
  ["hsv", "huntsville"],
  ["mob", "mobile"],
  ["lr", "littlerock"],
  ["tul", "tulsa"],
  ["wich", "wichita"],
  ["dsm", "desmoines"],
  ["fargo"],
  ["sf", "siouxfalls"],
  ["bil", "billings"],
  ["boi", "boise"],
  ["anc", "anchorage"],
  ["hnl", "honolulu"],
  ["pvd", "providence"],
  ["bdl", "hartford"],
  ["alb", "albany"],
  ["buf", "buffalo"],
  ["roc", "rochester"],
  ["syr", "syracuse"],
  ["rich", "richmond"],
  ["nor", "norfolk"],
  ["vab", "virginiabeach"],
  ["chs", "charleston"],
  ["sav", "savannah"],
  ["tlh", "tallahassee"],
  ["ftl", "fortlauderdale"],
  ["wpb", "westpalmbeach"],
  ["spi", "springfield"],
  ["lex", "lexington"],
  ["chat", "chattanooga"],
  ["knox", "knoxville"],
  ["jxn", "jackson"],
  ["bat", "batonrouge"],
  ["shr", "shreveport"],
  ["lub", "lubbock"],
  ["cor", "corpuschristi"],
  ["lar", "laredo"],
  ["amar", "amarillo"],
  ["tuc", "tucson"],
  ["mes", "mesa"],
  ["rno", "reno"],
  ["spo", "spokane"],
  ["tac", "tacoma"],
  ["eug", "eugene"],
  ["bak", "bakersfield"],
  ["sac", "stockton"],
  ["mod", "modesto"],
  ["riv", "riverside"],
  ["sb", "sanbernardino"],
  ["ana", "anaheim"],
  ["irv", "irvine"],
  ["ftw", "fortworth"],
  ["arl", "arlington"],
  ["plano"],
  ["gar", "garland"],
  ["frisco"],
  ["mck", "mckinney"],
  ["den", "denton"],

  // Tornado family
  ["tornado", "twister", "cyclone", "funnel", "rotation", "vortex",
   "waterspout", "landspout", "gustnado", "wedge", "stovepipe", "rope"],

  // Hail family
  ["hail", "hailstorm", "hailstone", "hailstones", "ice", "iceball", "chunks"],

  // Hail size descriptors (treated as synonyms of each other)
  ["large", "massive", "huge", "giant", "big", "significant", "major", "great",
   "golf", "baseball", "softball", "grapefruit", "egg", "quarter"],

  // Wind family
  ["wind", "gust", "gale", "squall", "derecho", "microburst",
   "downburst", "windshear", "breeze", "blowing"],

  // Rain family
  ["rain", "downpour", "shower", "drizzle", "precipitation",
   "pelting", "deluge", "rainstorm"],

  // Flooding family
  ["flood", "flooding", "flash", "inundation", "surge", "overflow",
   "submerged", "swamped", "underwater", "waterlogged"],

  // Thunder / storm family
  ["storm", "thunder", "thunderstorm", "supercell", "tstorm",
   "convection", "convective", "mesocyclone", "cell"],

  // Lightning family
  ["lightning", "bolt", "strike", "electrification"],

  // Snow / winter family
  ["snow", "blizzard", "sleet", "freezing", "ice", "wintry",
   "whiteout", "graupel", "frost", "icing"],

  // Visibility family
  ["fog", "mist", "haze", "visibility", "obscured", "dense"],

  // Power / infrastructure
  ["power", "outage", "blackout", "electricity"],
  ["lines", "outage", "downed", "down"],
  ["down", "outage", "downed", "fallen"],
  ["debris", "damage", "destruction", "wreckage", "rubble"],
  ["collapse", "destroyed", "demolished", "flattened"],
  ["blocked", "impassable", "closed", "shutdown"],

  // Severity / intensity
  ["severe", "extreme", "intense", "violent", "catastrophic",
   "devastating", "dangerous", "deadly", "destructive"],
  ["strong", "powerful", "heavy", "forceful"],
  ["hitting", "striking", "pounding", "falling", "slamming",
   "battering", "hammering", "pelting", "lashing"],

  // Barometric
  ["barometric", "pressure", "barometer"],
  ["drop", "falling", "plummeting", "plunge", "decrease", "decline"],

  // Temperature
  ["heat", "heatwave", "scorching", "hot", "sweltering"],
  ["cold", "frigid", "freezing", "arctic", "bitter"],
];

function getSynonymGroup(word: string): string[] {
  const groups: string[] = [word];
  for (const group of SYNONYMS) {
    if (group.some(s => s === word || s.includes(word) || word.includes(s))) {
      groups.push(...group);
    }
  }
  return [...new Set(groups)];
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
}

function wordsMatch(a: string, b: string): boolean {
  if (a.includes(b) || b.includes(a)) return true;
  const synA = getSynonymGroup(a);
  const synB = getSynonymGroup(b);
  return synA.some(sa => synB.some(sb => sa === sb || sa.includes(sb) || sb.includes(sa)));
}

function findMatch(reports: StackedReport[], input: string): number {
  const words = tokenize(input);
  if (words.length === 0) return -1;

  const inputSpecific = words.filter(w => !GENERIC_WORDS.has(w));
  const inputGeneric = words.filter(w => GENERIC_WORDS.has(w));

  let bestIdx = -1, bestScore = 0;

  for (let i = 0; i < reports.length; i++) {
    const topicWords = tokenize(reports[i].topic);
    const topicSpecific = topicWords.filter(w => !GENERIC_WORDS.has(w));
    const topicGeneric = topicWords.filter(w => GENERIC_WORDS.has(w));

    const specificMatch = inputSpecific.filter(w =>
      topicSpecific.some(tw => wordsMatch(w, tw))
    ).length;

    const genericMatch = inputGeneric.filter(w =>
      topicGeneric.some(tw => wordsMatch(w, tw))
    ).length;

    const hasSpecificOverlap = inputSpecific.length === 0
      ? true
      : specificMatch >= Math.max(1, inputSpecific.length * 0.5);
    
    const hasGenericOverlap = inputGeneric.length === 0
      ? true
      : genericMatch >= 1;

    if (!hasSpecificOverlap || !hasGenericOverlap) continue;
    if (inputSpecific.length > 0 && specificMatch === 0) continue;

    const totalScore = specificMatch * 3 + genericMatch;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

interface PeerReviewQueueProps {
  userRole: "guest" | "citizen" | "meteorologist";
}

const PeerReviewQueue = ({ userRole }: PeerReviewQueueProps) => {
  const [reports, setReports] = useState<StackedReport[]>(initialReports);
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [verified, setVerified] = useState<Set<string>>(new Set());

  const handleVerify = (id: string) => {
    setVerified(prev => new Set(prev).add(id));
  };

  const handleRemove = (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
    setExpanded(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setVerified(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const isMeteo = userRole === "meteorologist";

    const newSingle: SingleReport = {
      id: crypto.randomUUID(),
      text: trimmed,
      username: isMeteo ? "METEOROLOGIST" : "YOU",
      time: "just now",
    };

    const idx = findMatch(reports, trimmed);
    let verifyId: string;

    if (idx >= 0) {
      verifyId = reports[idx].id;
      setReports(prev => {
        const next = prev.map((r, i) =>
          i === idx
            ? { ...r, count: r.count + 1, latestTime: "just now", reports: [newSingle, ...r.reports] }
            : r
        );
        return next.sort((a, b) => b.count - a.count);
      });
    } else {
      verifyId = crypto.randomUUID();
      const newGroup: StackedReport = {
        id: verifyId,
        topic: toTitleCase(trimmed),
        count: 1,
        latestTime: "just now",
        type: "REPORT",
        reports: [newSingle],
      };
      setReports(prev => [...prev, newGroup].sort((a, b) => b.count - a.count));
    }

    if (isMeteo) {
      setVerified(prev => new Set(prev).add(verifyId));
    }

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
          {[...reports].sort((a, b) => {
            const aV = verified.has(a.id) ? 1 : 0;
            const bV = verified.has(b.id) ? 1 : 0;
            if (bV !== aV) return bV - aV;
            return b.count - a.count;
          }).map((report, i) => {
            const isOpen = expanded.has(report.id);
            return (
              <motion.div
                key={report.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: i * 0.05 }}
                className="bg-shroud border border-border hover:border-primary/20 transition-colors"
              >
                {/* Header — clickable to expand */}
                <button
                  onClick={() => toggleExpand(report.id)}
                  className="w-full p-3 text-left space-y-2"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-xs font-mono font-bold text-card-foreground leading-tight flex items-center gap-1.5">
                      {verified.has(report.id) && <CheckCircle2 className="size-3.5 text-neon-green shrink-0" />}
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
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground">{report.latestTime}</span>
                      <ChevronDown className={`size-3 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                </button>

                {/* Expanded individual reports */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-1.5 border-t border-border/50 pt-2">
                        {report.reports.length === 0 ? (
                          <p className="text-[10px] font-mono text-muted-foreground italic">
                            {report.count} citizen reports aggregated
                          </p>
                        ) : (
                          <>
                            {report.reports.map((single) => (
                              <div
                                key={single.id}
                                className="bg-background/40 border border-border/50 px-2 py-1.5 space-y-0.5"
                              >
                                <div className="flex justify-between items-center">
                                  <span className="text-[9px] font-mono font-bold text-card-foreground">
                                    {single.username}
                                  </span>
                                  <span className="text-[9px] font-mono text-muted-foreground">
                                    {single.time}
                                  </span>
                                </div>
                                <p className="text-[10px] font-mono text-foreground/80 leading-tight">
                                  {single.text}
                                </p>
                              </div>
                            ))}
                            {report.count > report.reports.length && (
                              <p className="text-[9px] font-mono text-muted-foreground text-center pt-1">
                                +{report.count - report.reports.length} more reports
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Verify + Remove */}
                <div className="px-3 pb-3 flex gap-2">
                  {!verified.has(report.id) && (
                    <button
                      onClick={() => handleVerify(report.id)}
                      className="flex-1 py-1.5 bg-neon-green/10 border border-neon-green/20 text-neon-green font-mono text-[10px] uppercase font-bold hover:bg-neon-green hover:text-background transition-all rounded-sm"
                    >
                      Verify
                    </button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        aria-label="Remove report"
                        className={`${verified.has(report.id) ? "ml-auto" : ""} size-7 flex items-center justify-center bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all rounded-sm shrink-0`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-cockpit border-border">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-mono text-card-foreground uppercase text-sm">
                          Remove Report
                        </AlertDialogTitle>
                        <AlertDialogDescription className="font-mono text-xs text-muted-foreground leading-relaxed">
                          Please remove a report only if it's a spam, a completely unrelated report, non-meteorological comment, or if it contains any links or dangerous material.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="font-mono text-[10px] uppercase">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemove(report.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono text-[10px] uppercase"
                        >
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </motion.div>
            );
          })}
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
    </aside>
  );
};

export default PeerReviewQueue;
