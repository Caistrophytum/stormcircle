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

function boxToRing(box: [number, number, number, number]): number[][] {
  const [minLon, minLat, maxLon, maxLat] = box;
  return [
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
    [minLon, minLat],
  ];
}

/** Build a Polygon/MultiPolygon covering every resolved region. */
export function regionsToGeometry(boxes: Array<[number, number, number, number]>) {
  if (boxes.length === 0) return null;
  const polys = boxes.map((b) => [boxToRing(b)]);
  if (polys.length === 1) return { type: "Polygon", coordinates: polys[0] };
  return { type: "MultiPolygon", coordinates: polys };
}
