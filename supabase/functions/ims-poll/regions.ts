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
 * gbOpen ADM0, Douglas–Peucker simplified to ~0.004 deg). Region footprints
 * are clipped against this ring so no warning polygon ever spills into the
 * sea or a neighbouring country.
 */
export const ISRAEL_OUTLINE: number[][] = [
  [35.7733, 33.3356],
  [35.7370, 33.3196],
  [35.7384, 33.3253],
  [35.7318, 33.3263],
  [35.6957, 33.2953],
  [35.6757, 33.2940],
  [35.6601, 33.2748],
  [35.6431, 33.2803],
  [35.6219, 33.2726],
  [35.6192, 33.2557],
  [35.6242, 33.2424],
  [35.5985, 33.2542],
  [35.5836, 33.2663],
  [35.5846, 33.2820],
  [35.5657, 33.2887],
  [35.5641, 33.2733],
  [35.5472, 33.2546],
  [35.5477, 33.2377],
  [35.5372, 33.2306],
  [35.5424, 33.1948],
  [35.5271, 33.1420],
  [35.5331, 33.1298],
  [35.5269, 33.1191],
  [35.5031, 33.1133],
  [35.5035, 33.0895],
  [35.4459, 33.0906],
  [35.4314, 33.0654],
  [35.3822, 33.0615],
  [35.3799, 33.0480],
  [35.3745, 33.0552],
  [35.3619, 33.0496],
  [35.3593, 33.0568],
  [35.3263, 33.0775],
  [35.3210, 33.0879],
  [35.3241, 33.0966],
  [35.3168, 33.1049],
  [35.3006, 33.1005],
  [35.2933, 33.1080],
  [35.2385, 33.0922],
  [35.2122, 33.0999],
  [35.2075, 33.0876],
  [35.1893, 33.0835],
  [35.1881, 33.0894],
  [35.1773, 33.0926],
  [35.1588, 33.0843],
  [35.1489, 33.0874],
  [35.1556, 33.0915],
  [35.1036, 33.0942],
  [35.1018, 33.0505],
  [35.0653, 32.9200],
  [35.0787, 32.9186],
  [35.0798, 32.8984],
  [35.0591, 32.8448],
  [35.0394, 32.8212],
  [35.0227, 32.8176],
  [35.0359, 32.8138],
  [35.0288, 32.8086],
  [35.0313, 32.8044],
  [35.0247, 32.8147],
  [35.0196, 32.8127],
  [35.0229, 32.8160],
  [35.0177, 32.8125],
  [35.0156, 32.8210],
  [35.0114, 32.8141],
  [35.0094, 32.8228],
  [35.0043, 32.8180],
  [34.9915, 32.8261],
  [34.9917, 32.8303],
  [35.0165, 32.8275],
  [34.9912, 32.8316],
  [34.9980, 32.8335],
  [34.9780, 32.8363],
  [34.9545, 32.8243],
  [34.9466, 32.7276],
  [34.9416, 32.7098],
  [34.9274, 32.6979],
  [34.9270, 32.6583],
  [34.8976, 32.5173],
  [34.8888, 32.5029],
  [34.8833, 32.4677],
  [34.8792, 32.4735],
  [34.8839, 32.4649],
  [34.8295, 32.2613],
  [34.7598, 32.0622],
  [34.7449, 32.0470],
  [34.7080, 31.9425],
  [34.6930, 31.9228],
  [34.6645, 31.8561],
  [34.6520, 31.8378],
  [34.6442, 31.8367],
  [34.6503, 31.8320],
  [34.6398, 31.8314],
  [34.6479, 31.8275],
  [34.6413, 31.8288],
  [34.6457, 31.8250],
  [34.6405, 31.8257],
  [34.6405, 31.8184],
  [34.6348, 31.8254],
  [34.6374, 31.8444],
  [34.6344, 31.8257],
  [34.6402, 31.8167],
  [34.6266, 31.7931],
  [34.6256, 31.7983],
  [34.6275, 31.7922],
  [34.6075, 31.7565],
  [34.4912, 31.5950],
  [34.5667, 31.5415],
  [34.5654, 31.5332],
  [34.5468, 31.5130],
  [34.5127, 31.5007],
  [34.4779, 31.4762],
  [34.3803, 31.3896],
  [34.3651, 31.3644],
  [34.3733, 31.3062],
  [34.3665, 31.2905],
  [34.3422, 31.2783],
  [34.3258, 31.2580],
  [34.2919, 31.2412],
  [34.2675, 31.2201],
  [34.4034, 30.8583],
  [34.4964, 30.6809],
  [34.4928, 30.6761],
  [34.5190, 30.6033],
  [34.5156, 30.5336],
  [34.5537, 30.4979],
  [34.5359, 30.4310],
  [34.5423, 30.4268],
  [34.5427, 30.4130],
  [34.5470, 30.4056],
  [34.5581, 30.4044],
  [34.6139, 30.3681],
  [34.8013, 29.8724],
  [34.8236, 29.8303],
  [34.8260, 29.8086],
  [34.8332, 29.8069],
  [34.8320, 29.7947],
  [34.8438, 29.7792],
  [34.8582, 29.6859],
  [34.8803, 29.6487],
  [34.8664, 29.5976],
  [34.8786, 29.5433],
  [34.9027, 29.4906],
  [34.9543, 29.5492],
  [34.9603, 29.5481],
  [34.9586, 29.5543],
  [34.9662, 29.5535],
  [34.9604, 29.5495],
  [34.9673, 29.5457],
  [34.9711, 29.5519],
  [34.9675, 29.5462],
  [34.9774, 29.5429],
  [34.9783, 29.5773],
  [35.0197, 29.6560],
  [35.0211, 29.6725],
  [35.0119, 29.6968],
  [35.0300, 29.7719],
  [35.0439, 29.7881],
  [35.0586, 29.8407],
  [35.0845, 29.8855],
  [35.0773, 29.9249],
  [35.0836, 29.9471],
  [35.0753, 29.9503],
  [35.0890, 29.9634],
  [35.0989, 29.9915],
  [35.1162, 29.9952],
  [35.1104, 30.0092],
  [35.1009, 30.0123],
  [35.1307, 30.0616],
  [35.1458, 30.0628],
  [35.1516, 30.0826],
  [35.1622, 30.1225],
  [35.1609, 30.1344],
  [35.1510, 30.1436],
  [35.1550, 30.1550],
  [35.1446, 30.1626],
  [35.1514, 30.2025],
  [35.1460, 30.2820],
  [35.1547, 30.3067],
  [35.1920, 30.3461],
  [35.1657, 30.4007],
  [35.1620, 30.4413],
  [35.1932, 30.4989],
  [35.1951, 30.5340],
  [35.2039, 30.5485],
  [35.2040, 30.5820],
  [35.2222, 30.6191],
  [35.2639, 30.6602],
  [35.2627, 30.6725],
  [35.2818, 30.7104],
  [35.2937, 30.7123],
  [35.2863, 30.7229],
  [35.2945, 30.7349],
  [35.2958, 30.7620],
  [35.3082, 30.7623],
  [35.3138, 30.7696],
  [35.3157, 30.7902],
  [35.3222, 30.7969],
  [35.3369, 30.7987],
  [35.3411, 30.8155],
  [35.3299, 30.8415],
  [35.3315, 30.8609],
  [35.3543, 30.9083],
  [35.3712, 30.9268],
  [35.3941, 30.9266],
  [35.4165, 30.9509],
  [35.4260, 31.0448],
  [35.4503, 31.0895],
  [35.4562, 31.1283],
  [35.4493, 31.1574],
  [35.4110, 31.2102],
  [35.3993, 31.2529],
  [35.4066, 31.2815],
  [35.4607, 31.3717],
  [35.4722, 31.4196],
  [35.4769, 31.4842],
  [35.4749, 31.4966],
  [35.3947, 31.4917],
  [35.2307, 31.3745],
  [35.1343, 31.3549],
  [35.0085, 31.3577],
  [34.9264, 31.3417],
  [34.8904, 31.3712],
  [34.8814, 31.3917],
  [34.8836, 31.4039],
  [34.8998, 31.4371],
  [34.9250, 31.4644],
  [34.9432, 31.5031],
  [34.9412, 31.5484],
  [34.9474, 31.5822],
  [34.9965, 31.6449],
  [35.0853, 31.6906],
  [35.1064, 31.7148],
  [35.1205, 31.7156],
  [35.1337, 31.7342],
  [35.1397, 31.7288],
  [35.1509, 31.7367],
  [35.1798, 31.7205],
  [35.2058, 31.7236],
  [35.2391, 31.7096],
  [35.2515, 31.7388],
  [35.2634, 31.7486],
  [35.2517, 31.7702],
  [35.2630, 31.7900],
  [35.2554, 31.8128],
  [35.2650, 31.8255],
  [35.2511, 31.8304],
  [35.2571, 31.8383],
  [35.2510, 31.8439],
  [35.2301, 31.8426],
  [35.2202, 31.8827],
  [35.2068, 31.8815],
  [35.2042, 31.8726],
  [35.2145, 31.8508],
  [35.2159, 31.8207],
  [35.2098, 31.8171],
  [35.2067, 31.8234],
  [35.1841, 31.8259],
  [35.1876, 31.8094],
  [35.1599, 31.8091],
  [35.1203, 31.8253],
  [35.1072, 31.8239],
  [35.0859, 31.8504],
  [35.0689, 31.8565],
  [35.0469, 31.8502],
  [35.0222, 31.8298],
  [34.9778, 31.8326],
  [34.9956, 31.8529],
  [35.0331, 31.8580],
  [35.0389, 31.9068],
  [35.0311, 31.9235],
  [35.0032, 31.9348],
  [35.0088, 31.9436],
  [34.9875, 31.9678],
  [34.9941, 31.9728],
  [34.9996, 32.0175],
  [35.0052, 32.0219],
  [34.9995, 32.0531],
  [34.9825, 32.0896],
  [34.9932, 32.1064],
  [34.9853, 32.1263],
  [34.9904, 32.1422],
  [34.9745, 32.1521],
  [34.9773, 32.1587],
  [34.9596, 32.1757],
  [34.9570, 32.1901],
  [34.9644, 32.2000],
  [34.9891, 32.2075],
  [35.0142, 32.2355],
  [35.0202, 32.2344],
  [35.0306, 32.2657],
  [35.0201, 32.2793],
  [35.0090, 32.2812],
  [35.0162, 32.3385],
  [35.0269, 32.3401],
  [35.0286, 32.3469],
  [35.0409, 32.3465],
  [35.0507, 32.3640],
  [35.0490, 32.3765],
  [35.0402, 32.3806],
  [35.0539, 32.4029],
  [35.0663, 32.4504],
  [35.0925, 32.4762],
  [35.1070, 32.4754],
  [35.1260, 32.4839],
  [35.2246, 32.5521],
  [35.2522, 32.5233],
  [35.2886, 32.5107],
  [35.3563, 32.5188],
  [35.4030, 32.5012],
  [35.4051, 32.4837],
  [35.4203, 32.4589],
  [35.4111, 32.4360],
  [35.4189, 32.4172],
  [35.4321, 32.4085],
  [35.4757, 32.4111],
  [35.5412, 32.3872],
  [35.5550, 32.3890],
  [35.5464, 32.4009],
  [35.5605, 32.4010],
  [35.5614, 32.4112],
  [35.5518, 32.4224],
  [35.5622, 32.4239],
  [35.5555, 32.4309],
  [35.5658, 32.4358],
  [35.5664, 32.4529],
  [35.5738, 32.4587],
  [35.5624, 32.4635],
  [35.5699, 32.4772],
  [35.5654, 32.4810],
  [35.5802, 32.4874],
  [35.5751, 32.4972],
  [35.5583, 32.5021],
  [35.5645, 32.5070],
  [35.5624, 32.5146],
  [35.5599, 32.5073],
  [35.5525, 32.5147],
  [35.5670, 32.5252],
  [35.5599, 32.5313],
  [35.5614, 32.5449],
  [35.5694, 32.5389],
  [35.5694, 32.5520],
  [35.5770, 32.5526],
  [35.5704, 32.5654],
  [35.5769, 32.5685],
  [35.5781, 32.5970],
  [35.5672, 32.5966],
  [35.5728, 32.6137],
  [35.5615, 32.6247],
  [35.5679, 32.6329],
  [35.5612, 32.6373],
  [35.5681, 32.6424],
  [35.5613, 32.6459],
  [35.5873, 32.6435],
  [35.5882, 32.6514],
  [35.6053, 32.6517],
  [35.6065, 32.6601],
  [35.5971, 32.6676],
  [35.6103, 32.6783],
  [35.6254, 32.6786],
  [35.6352, 32.6865],
  [35.6448, 32.6777],
  [35.6559, 32.6852],
  [35.6654, 32.6806],
  [35.6752, 32.6854],
  [35.6711, 32.6930],
  [35.6762, 32.7059],
  [35.7174, 32.7165],
  [35.7264, 32.7270],
  [35.7314, 32.7235],
  [35.7375, 32.7327],
  [35.7484, 32.7334],
  [35.7826, 32.7743],
  [35.8003, 32.7823],
  [35.8377, 32.8282],
  [35.8511, 32.8898],
  [35.8950, 32.9449],
  [35.8713, 32.9814],
  [35.8505, 33.1024],
  [35.8170, 33.1130],
  [35.8180, 33.1274],
  [35.8444, 33.1676],
  [35.8377, 33.1931],
  [35.8172, 33.2031],
  [35.8151, 33.2450],
  [35.7840, 33.2659],
  [35.7774, 33.2767],
  [35.8132, 33.3170],
  [35.7733, 33.3356]
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
