/**
 * Comfort Perception wording used in notification text.
 *
 * The bands mirror src/lib/comfortPerception.ts exactly (same rounded °C
 * thresholds, same order). Keep the two in sync so a recap sentence and the
 * on-screen chip never disagree about what a temperature "feels like".
 */
export function feelWord(c: number): string {
  const t = Math.round(c);
  if (t < -10) return "dangerously cold";
  if (t < 0) return "very cold";
  if (t < 6) return "cold";
  if (t < 12) return "chilly";
  if (t < 16) return "crisp";
  if (t < 21) return "comfortable";
  if (t < 25) return "tepid";
  if (t < 29) return "warm";
  if (t < 33) return "hot";
  if (t < 39) return "very hot";
  if (t < 46) return "dangerously hot";
  return "extremely hot";
}

/** "a" or "an" in front of a feelWord phrase. */
export const aOrAn = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");
