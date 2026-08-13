// Approximate geographic footprints for the Israel Meteorological Service
// (IMS) forecast regions.
//
// The IMS warning RSS feed names regions in prose ("in Eastern Upper Galilee,
// in Hula Valley and in Judea Mountains") and ships NO geometry. To render
// the warnings on the map — and to answer "does this warning cover my
// hometown?" — we attach a bounding footprint to each named region.
//
// These are deliberately coarse rectangles that follow the IMS regional map.
// They are accurate enough for point-in-region testing at city scale, which
// is the only thing the app uses them for.

export interface RegionBox {
  /** Canonical IMS English region name. */
  name: string;
  /** [minLon, minLat, maxLon, maxLat] */
  box: [number, number, number, number];
  /** Extra spellings/typos seen in the feed (already normalized). */
  aliases?: string[];
}

/** Whole-country footprint, used for "All of Israel" style warnings. */
export const ISRAEL_BOX: [number, number, number, number] = [34.2, 29.45, 35.92, 33.33];

export const IMS_REGIONS: RegionBox[] = [
  // --- Golan & Galilee ---
  { name: "Northern Golan", box: [35.62, 32.95, 35.9, 33.3] },
  { name: "Southern Golan", box: [35.6, 32.63, 35.87, 32.96] },
  { name: "Eastern Upper Galilee", box: [35.44, 32.95, 35.63, 33.28] },
  { name: "Western Upper Galilee", box: [35.12, 32.93, 35.45, 33.15] },
  { name: "Eastern Lower Galilee", box: [35.33, 32.63, 35.6, 32.95] },
  { name: "Western Lower Galilee", box: [35.05, 32.68, 35.35, 32.95] },
  { name: "Hula Valley", box: [35.53, 32.98, 35.7, 33.26] },
  { name: "Kinarot Valley", box: [35.47, 32.68, 35.68, 32.94], aliases: ["kineret valley", "kinneret valley"] },
  { name: "Bet Shean Valley", box: [35.42, 32.38, 35.63, 32.66], aliases: ["beit shean valley", "beth shean valley"] },
  { name: "Izrael Valley", box: [35.05, 32.53, 35.47, 32.8], aliases: ["jezreel valley", "yizrael valley"] },

  // --- Coast & central plain ---
  { name: "North Coast", box: [34.88, 32.68, 35.16, 33.1] },
  { name: "Carmel", box: [34.9, 32.5, 35.15, 32.83], aliases: ["mount carmel", "carmel mountains"] },

  { name: "Centeral and South Coast", box: [34.45, 31.42, 34.95, 32.7], aliases: ["central and south coast", "coastal plain", "center and south coast"] },
  { name: "Plain of Manasseh", box: [34.92, 32.36, 35.22, 32.63], aliases: ["menashe plain", "manasseh plain"] },
  { name: "Sharon", box: [34.78, 32.08, 35.02, 32.5] },
  { name: "Dan Region", box: [34.7, 31.93, 34.92, 32.2], aliases: ["gush dan", "tel aviv area"] },

  // --- Mountains & foothills ---
  { name: "Judean Foothills", box: [34.83, 31.45, 35.08, 31.98], aliases: ["shfela", "judea foothills"] },
  { name: "Center Mountains", box: [34.98, 31.68, 35.32, 32.02], aliases: ["central mountains"] },
  { name: "Judea Mountains", box: [34.98, 31.38, 35.28, 31.88], aliases: ["judean mountains", "jerusalem mountains", "jerusalem"] },
  { name: "Northern Samaria", box: [34.98, 32.18, 35.36, 32.56] },
  { name: "North Eastern Samaria", box: [35.32, 32.16, 35.56, 32.5], aliases: ["northeastern samaria"] },
  { name: "Samaria Mountains", box: [35.05, 31.98, 35.42, 32.36], aliases: ["samaria"] },

  // --- Rift valley, desert & Dead Sea ---
  { name: "Jordan Valley", box: [35.38, 31.82, 35.62, 32.42] },
  { name: "Judean Desert Margins", box: [35.2, 31.28, 35.42, 31.88], aliases: ["judea desert margins", "desert margins"] },
  { name: "North Judea Desert and Dead Sea", box: [35.3, 31.48, 35.56, 31.88], aliases: ["northern judea desert and dead sea", "north judean desert and dead sea"] },
  { name: "South Judea Desert and Dead Sea", box: [35.26, 30.96, 35.52, 31.5], aliases: ["southern judea desert and dead sea", "south judean desert and dead sea"] },
  { name: "Arava", box: [34.98, 29.88, 35.42, 31.0], aliases: ["aravah", "arava valley"] },

  // --- Negev ---
  { name: "North Western Negev", box: [34.36, 31.16, 34.78, 31.6], aliases: ["northwestern negev"] },
  { name: "Western Negev", box: [34.38, 30.88, 34.82, 31.3] },
  { name: "Northern Negev", box: [34.72, 31.06, 35.08, 31.52] },
  { name: "North Eastern Negev", box: [34.92, 30.96, 35.28, 31.42], aliases: ["northeastern negev"] },
  { name: "Eastern Negev", box: [34.88, 30.56, 35.22, 31.06] },
  { name: "Negev Mountain", box: [34.48, 30.26, 34.98, 30.92], aliases: ["negev mountains", "mount negev"] },
  { name: "Southern Negev and Eilat Mountai", box: [34.66, 29.48, 35.08, 30.32], aliases: ["southern negev and eilat mountains", "southern negev and eilat mountain", "eilat mountains", "southern negev"] },
  { name: "Eilat", box: [34.88, 29.48, 35.02, 29.64] },
];

/** Lowercase, collapse whitespace, strip punctuation for fuzzy matching. */
export function normalizeRegion(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LOOKUP = new Map<string, RegionBox>();
for (const r of IMS_REGIONS) {
  LOOKUP.set(normalizeRegion(r.name), r);
  for (const a of r.aliases ?? []) LOOKUP.set(normalizeRegion(a), r);
}

/**
 * Resolve a region phrase from the feed to a known IMS region. Falls back to
 * a containment match so truncated feed spellings ("Eilat Mountai") still
 * land on the right region.
 */
export function matchRegion(phrase: string): RegionBox | null {
  const n = normalizeRegion(phrase);
  if (!n) return null;
  const exact = LOOKUP.get(n);
  if (exact) return exact;
  let best: RegionBox | null = null;
  let bestLen = 0;
  for (const [key, region] of LOOKUP) {
    if ((n.includes(key) || key.includes(n)) && key.length > bestLen) {
      best = region;
      bestLen = key.length;
    }
  }
  return best;
}

export function isWholeCountry(phrase: string): boolean {
  const n = normalizeRegion(phrase);
  return /^(all of israel|israel|the whole country|country wide|countrywide|all over the country)$/.test(n);
}

/**
 * National outline (lon/lat) — real Israeli border geometry (geoBoundaries
 * gbOpen ADM0 for Israel unioned with the West Bank/Gaza outline, i.e. the
 * full IMS forecast domain, simplified to ~0.004 deg). Region footprints
 * are clipped against this ring so no warning polygon ever spills into the
 * sea or a neighbouring country.
 */
export const ISRAEL_OUTLINE: number[][] = [
  [34.2190, 31.3233],
  [34.3490, 31.4364],
  [34.4665, 31.5614],
  [34.6075, 31.7565],
  [34.6273, 31.7919],
  [34.6252, 31.7951],
  [34.6256, 31.7983],
  [34.6400, 31.8164],
  [34.6354, 31.8224],
  [34.6344, 31.8257],
  [34.6374, 31.8444],
  [34.6349, 31.8254],
  [34.6405, 31.8185],
  [34.6405, 31.8257],
  [34.6455, 31.8247],
  [34.6413, 31.8288],
  [34.6477, 31.8273],
  [34.6398, 31.8314],
  [34.6502, 31.8322],
  [34.6442, 31.8367],
  [34.6519, 31.8379],
  [34.6647, 31.8564],
  [34.6930, 31.9228],
  [34.7048, 31.9356],
  [34.7449, 32.0470],
  [34.7598, 32.0622],
  [34.7664, 32.0879],
  [34.7691, 32.0874],
  [34.7697, 32.0945],
  [34.7716, 32.0948],
  [34.7723, 32.0990],
  [34.7757, 32.1024],
  [34.7733, 32.1091],
  [34.7832, 32.1228],
  [34.7939, 32.1530],
  [34.7913, 32.1596],
  [34.7925, 32.1659],
  [34.7926, 32.1591],
  [34.8295, 32.2613],
  [34.8838, 32.4647],
  [34.8807, 32.4679],
  [34.8792, 32.4735],
  [34.8833, 32.4678],
  [34.9083, 32.5606],
  [34.9292, 32.6740],
  [34.9274, 32.6979],
  [34.9416, 32.7098],
  [34.9466, 32.7276],
  [34.9545, 32.8243],
  [34.9780, 32.8363],
  [34.9980, 32.8335],
  [34.9914, 32.8318],
  [35.0165, 32.8275],
  [34.9917, 32.8302],
  [34.9929, 32.8256],
  [35.0045, 32.8180],
  [35.0094, 32.8228],
  [35.0117, 32.8142],
  [35.0156, 32.8210],
  [35.0176, 32.8129],
  [35.0229, 32.8160],
  [35.0207, 32.8132],
  [35.0312, 32.8046],
  [35.0360, 32.8135],
  [35.0319, 32.8126],
  [35.0227, 32.8175],
  [35.0394, 32.8212],
  [35.0591, 32.8448],
  [35.0798, 32.8984],
  [35.0787, 32.9185],
  [35.0653, 32.9200],
  [35.1019, 33.0506],
  [35.1036, 33.0942],
  [35.1556, 33.0915],
  [35.1511, 33.0886],
  [35.1584, 33.0852],
  [35.1773, 33.0926],
  [35.1930, 33.0847],
  [35.2075, 33.0877],
  [35.2122, 33.0999],
  [35.2384, 33.0923],
  [35.2933, 33.1080],
  [35.3009, 33.1005],
  [35.3168, 33.1049],
  [35.3268, 33.0777],
  [35.3619, 33.0497],
  [35.3745, 33.0552],
  [35.3789, 33.0489],
  [35.3822, 33.0615],
  [35.4314, 33.0655],
  [35.4459, 33.0906],
  [35.5032, 33.0897],
  [35.5031, 33.1133],
  [35.5271, 33.1195],
  [35.5329, 33.1299],
  [35.5271, 33.1420],
  [35.5424, 33.1953],
  [35.5372, 33.2306],
  [35.5477, 33.2377],
  [35.5472, 33.2546],
  [35.5640, 33.2732],
  [35.5657, 33.2887],
  [35.5846, 33.2820],
  [35.5837, 33.2663],
  [35.5986, 33.2542],
  [35.6232, 33.2429],
  [35.6219, 33.2726],
  [35.6431, 33.2803],
  [35.6600, 33.2748],
  [35.6757, 33.2940],
  [35.6957, 33.2959],
  [35.7318, 33.3263],
  [35.7380, 33.3206],
  [35.7733, 33.3356],
  [35.8132, 33.3170],
  [35.7775, 33.2766],
  [35.7840, 33.2659],
  [35.8151, 33.2450],
  [35.8172, 33.2032],
  [35.8377, 33.1931],
  [35.8444, 33.1676],
  [35.8181, 33.1274],
  [35.8170, 33.1132],
  [35.8505, 33.1024],
  [35.8713, 32.9815],
  [35.8950, 32.9449],
  [35.8511, 32.8898],
  [35.8377, 32.8282],
  [35.8003, 32.7823],
  [35.7825, 32.7743],
  [35.7483, 32.7334],
  [35.7374, 32.7325],
  [35.7314, 32.7235],
  [35.7264, 32.7268],
  [35.7174, 32.7165],
  [35.6766, 32.7059],
  [35.6712, 32.6930],
  [35.6752, 32.6854],
  [35.6654, 32.6806],
  [35.6560, 32.6852],
  [35.6448, 32.6777],
  [35.6352, 32.6864],
  [35.6254, 32.6786],
  [35.6103, 32.6783],
  [35.5972, 32.6678],
  [35.6065, 32.6601],
  [35.6053, 32.6517],
  [35.5888, 32.6516],
  [35.5873, 32.6435],
  [35.5616, 32.6460],
  [35.5681, 32.6424],
  [35.5618, 32.6251],
  [35.5728, 32.6137],
  [35.5672, 32.5968],
  [35.5781, 32.5970],
  [35.5769, 32.5685],
  [35.5707, 32.5653],
  [35.5770, 32.5526],
  [35.5693, 32.5517],
  [35.5694, 32.5389],
  [35.5618, 32.5447],
  [35.5599, 32.5315],
  [35.5670, 32.5252],
  [35.5529, 32.5147],
  [35.5606, 32.5079],
  [35.5624, 32.5146],
  [35.5645, 32.5070],
  [35.5583, 32.5022],
  [35.5751, 32.4972],
  [35.5802, 32.4874],
  [35.5662, 32.4811],
  [35.5699, 32.4772],
  [35.5624, 32.4636],
  [35.5738, 32.4587],
  [35.5665, 32.4526],
  [35.5658, 32.4358],
  [35.5556, 32.4311],
  [35.5622, 32.4239],
  [35.5518, 32.4225],
  [35.5589, 32.4189],
  [35.5605, 32.4010],
  [35.5466, 32.4007],
  [35.5626, 32.3847],
  [35.5640, 32.3739],
  [35.5595, 32.3603],
  [35.5532, 32.3661],
  [35.5595, 32.3483],
  [35.5538, 32.3435],
  [35.5532, 32.3220],
  [35.5637, 32.3097],
  [35.5550, 32.2988],
  [35.5669, 32.2860],
  [35.5660, 32.2759],
  [35.5581, 32.2721],
  [35.5648, 32.2619],
  [35.5626, 32.2514],
  [35.5715, 32.2437],
  [35.5582, 32.2372],
  [35.5641, 32.2286],
  [35.5697, 32.2304],
  [35.5730, 32.2193],
  [35.5651, 32.2177],
  [35.5735, 32.2091],
  [35.5641, 32.2085],
  [35.5627, 32.1983],
  [35.5692, 32.1997],
  [35.5726, 32.1927],
  [35.5584, 32.1840],
  [35.5617, 32.1778],
  [35.5548, 32.1751],
  [35.5589, 32.1704],
  [35.5518, 32.1722],
  [35.5580, 32.1648],
  [35.5487, 32.1617],
  [35.5564, 32.1588],
  [35.5522, 32.1555],
  [35.5607, 32.1514],
  [35.5588, 32.1445],
  [35.5433, 32.1405],
  [35.5498, 32.1356],
  [35.5428, 32.1307],
  [35.5508, 32.1321],
  [35.5506, 32.1265],
  [35.5430, 32.1103],
  [35.5322, 32.1077],
  [35.5463, 32.0811],
  [35.5394, 32.0823],
  [35.5352, 32.0691],
  [35.5300, 32.0710],
  [35.5346, 32.0638],
  [35.5298, 32.0503],
  [35.5210, 32.0505],
  [35.5190, 32.0359],
  [35.5224, 32.0200],
  [35.5290, 32.0198],
  [35.5244, 32.0044],
  [35.5417, 31.9983],
  [35.5346, 31.9856],
  [35.5474, 31.9709],
  [35.5403, 31.9585],
  [35.5443, 31.9319],
  [35.5362, 31.9299],
  [35.5391, 31.9238],
  [35.5274, 31.9228],
  [35.5243, 31.9079],
  [35.5341, 31.8938],
  [35.5329, 31.8825],
  [35.5497, 31.8727],
  [35.5370, 31.8563],
  [35.5490, 31.8440],
  [35.5487, 31.8237],
  [35.5393, 31.8164],
  [35.5515, 31.7965],
  [35.5474, 31.7830],
  [35.5583, 31.7579],
  [35.5070, 31.7642],
  [35.4827, 31.7174],
  [35.4521, 31.6962],
  [35.4463, 31.6541],
  [35.4313, 31.6370],
  [35.4350, 31.6249],
  [35.4239, 31.6187],
  [35.4178, 31.6110],
  [35.4214, 31.6044],
  [35.4138, 31.6009],
  [35.4116, 31.5848],
  [35.4196, 31.5670],
  [35.4038, 31.5491],
  [35.4062, 31.5304],
  [35.3975, 31.5147],
  [35.3999, 31.4934],
  [35.4749, 31.4966],
  [35.4769, 31.4843],
  [35.4722, 31.4196],
  [35.4607, 31.3717],
  [35.4066, 31.2815],
  [35.3993, 31.2529],
  [35.4109, 31.2103],
  [35.4493, 31.1574],
  [35.4547, 31.1044],
  [35.4260, 31.0448],
  [35.4165, 30.9509],
  [35.3941, 30.9266],
  [35.3712, 30.9267],
  [35.3543, 30.9083],
  [35.3315, 30.8609],
  [35.3299, 30.8414],
  [35.3411, 30.8155],
  [35.3369, 30.7987],
  [35.3221, 30.7968],
  [35.3157, 30.7901],
  [35.3138, 30.7696],
  [35.3082, 30.7623],
  [35.2959, 30.7618],
  [35.2945, 30.7349],
  [35.2866, 30.7231],
  [35.2937, 30.7123],
  [35.2817, 30.7101],
  [35.2629, 30.6726],
  [35.2639, 30.6602],
  [35.2222, 30.6192],
  [35.2041, 30.5820],
  [35.2039, 30.5485],
  [35.1951, 30.5340],
  [35.1932, 30.4989],
  [35.1620, 30.4412],
  [35.1657, 30.4007],
  [35.1920, 30.3461],
  [35.1547, 30.3067],
  [35.1460, 30.2821],
  [35.1514, 30.2025],
  [35.1446, 30.1628],
  [35.1550, 30.1550],
  [35.1511, 30.1436],
  [35.1609, 30.1344],
  [35.1622, 30.1225],
  [35.1516, 30.0826],
  [35.1458, 30.0628],
  [35.1306, 30.0614],
  [35.1011, 30.0128],
  [35.1104, 30.0092],
  [35.1162, 29.9952],
  [35.0989, 29.9914],
  [35.0890, 29.9634],
  [35.0755, 29.9508],
  [35.0836, 29.9470],
  [35.0773, 29.9252],
  [35.0845, 29.8855],
  [35.0586, 29.8406],
  [35.0439, 29.7881],
  [35.0300, 29.7719],
  [35.0120, 29.6969],
  [35.0211, 29.6725],
  [35.0197, 29.6560],
  [34.9783, 29.5773],
  [34.9774, 29.5429],
  [34.9543, 29.5491],
  [34.9027, 29.4906],
  [34.8786, 29.5433],
  [34.8664, 29.5976],
  [34.8800, 29.6484],
  [34.8582, 29.6859],
  [34.8438, 29.7791],
  [34.8320, 29.7947],
  [34.8332, 29.8067],
  [34.8260, 29.8086],
  [34.8235, 29.8304],
  [34.8013, 29.8724],
  [34.6139, 30.3679],
  [34.5581, 30.4043],
  [34.5470, 30.4056],
  [34.5427, 30.4130],
  [34.5422, 30.4267],
  [34.5359, 30.4310],
  [34.5535, 30.4980],
  [34.5156, 30.5336],
  [34.5189, 30.6033],
  [34.4928, 30.6761],
  [34.4962, 30.6812],
  [34.4034, 30.8583],
  [34.2402, 31.2955],
  [34.2190, 31.3233]
];

/** Sutherland-Hodgman clip of a ring against one half-plane. */
function clipEdge(
  ring: number[][],
  inside: (p: number[]) => boolean,
  intersect: (a: number[], b: number[]) => number[],
): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i];
    const prev = ring[(i + ring.length - 1) % ring.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

function lerp(a: number[], b: number[], t: number): number[] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Clip a ring against a generic half-plane  f(p) <= 0  (f affine). */
function clipHalfPlane(ring: number[][], f: (p: number[]) => number): number[][] {
  return clipEdge(
    ring,
    (p) => f(p) <= 0,
    (a, b) => {
      const fa = f(a);
      const fb = f(b);
      const t = Math.abs(fb - fa) < 1e-12 ? 0.5 : fa / (fa - fb);
      return lerp(a, b, Math.max(0, Math.min(1, t)));
    },
  );
}

function center(box: [number, number, number, number]): number[] {
  return [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
}

function boxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/**
 * Build the footprint of one IMS region:
 *   real national border  ∩  region bounding box  ∩  Voronoi cell of the
 *   region centre against every overlapping neighbouring region.
 *
 * The border ring is concave but each clip is a convex half-plane, so
 * Sutherland-Hodgman is exact. The Voronoi step removes the overlap between
 * neighbouring boxes, so adjacent IMS districts share a single border line
 * instead of smearing over each other.
 */
function regionRing(
  box: [number, number, number, number],
  neighbours: Array<[number, number, number, number]>,
): number[][] {
  const [minLon, minLat, maxLon, maxLat] = box;
  let ring = ISRAEL_OUTLINE.slice(0, -1); // open ring for clipping

  ring = clipHalfPlane(ring, (p) => minLon - p[0]);
  ring = clipHalfPlane(ring, (p) => p[0] - maxLon);
  ring = clipHalfPlane(ring, (p) => minLat - p[1]);
  ring = clipHalfPlane(ring, (p) => p[1] - maxLat);

  const clippedToBorder = ring;
  const c = center(box);
  for (const nb of neighbours) {
    if (nb === box) continue;
    const o = center(nb);
    const dx = o[0] - c[0];
    const dy = o[1] - c[1];
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
    const mx = (c[0] + o[0]) / 2;
    const my = (c[1] + o[1]) / 2;
    // Keep the side of the perpendicular bisector closest to this region.
    ring = clipHalfPlane(ring, (p) => (p[0] - mx) * dx + (p[1] - my) * dy);
    if (ring.length < 3) break;
  }

  // Voronoi trimming collapsed the cell — keep the border-clipped box.
  if (ring.length < 3) ring = clippedToBorder;

  if (ring.length < 3) {
    // Degenerate clip — fall back to the raw box.

    return [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ];
  }
  return [...ring, ring[0]];
}

const ALL_BOXES = IMS_REGIONS.map((r) => r.box);

/** Build a Polygon/MultiPolygon covering every resolved region. */
export function regionsToGeometry(boxes: Array<[number, number, number, number]>) {
  if (boxes.length === 0) return null;
  const polys = boxes.map((b) => {
    const isCountry = b[0] <= ISRAEL_BOX[0] && b[1] <= ISRAEL_BOX[1] && b[2] >= ISRAEL_BOX[2] && b[3] >= ISRAEL_BOX[3];
    const neighbours = isCountry ? [] : ALL_BOXES.filter((o) => o !== b && boxesOverlap(o, b));
    return [regionRing(b, neighbours)];
  });
  if (polys.length === 1) return { type: "Polygon", coordinates: polys[0] };
  return { type: "MultiPolygon", coordinates: polys };
}
