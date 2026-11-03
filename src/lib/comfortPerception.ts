/** Comfort Perception categories from apparent temperature (raw °C). */
const LADDER: Array<[number, string, string]> = [
  // [exclusive upper bound °C, label, color]
  [-10, "Dangerous Cold", "hsl(225 85% 55%)"],
  [0, "Very Cold", "hsl(215 85% 62%)"],
  [6, "Cold", "hsl(205 85% 70%)"],
  [12, "Chilly", "hsl(185 80% 60%)"],
  [16, "Crisp", "hsl(150 60% 55%)"],
  [21, "Comfortable", "hsl(120 60% 55%)"],
  [25, "Tepid", "hsl(90 60% 55%)"],
  [29, "Warm", "hsl(50 95% 55%)"],
  [33, "Hot", "hsl(37 100% 55%)"],
  [39, "Very Hot", "hsl(25 100% 55%)"],
  [46, "Dangerous Heat", "hsl(0 85% 58%)"],
  [Infinity, "Extreme Heat", "hsl(350 90% 45%)"],
];

const entry = (c: number) => LADDER.find(([max]) => Math.round(c) < max)!;

export const comfortPerception = (c: number) => entry(c)[1];

export const comfortPerceptionColor = (label: string): string | undefined =>
  LADDER.find(([, l]) => l === label)?.[2];
