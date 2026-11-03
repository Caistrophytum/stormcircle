import { describe, expect, it } from "vitest";
import { comfortPerception, comfortPerceptionColor } from "./comfortPerception";
import { aOrAn, feelWord } from "../../supabase/functions/notify-dispatch/feel";

/**
 * The Comfort Perception ladder the user picked: 12 bands, symmetric around
 * the 12-24 °C fully-comfortable band used by the exercise score.
 */
const BANDS: Array<[number, string, string]> = [
  [-11, "Dangerous Cold", "dangerously cold"],
  [-10, "Very Cold", "very cold"],
  [-1, "Very Cold", "very cold"],
  [0, "Cold", "cold"],
  [5, "Cold", "cold"],
  [6, "Chilly", "chilly"],
  [11, "Chilly", "chilly"],
  [12, "Crisp", "crisp"],
  [15, "Crisp", "crisp"],
  [16, "Comfortable", "comfortable"],
  [20, "Comfortable", "comfortable"],
  [21, "Tepid", "tepid"],
  [24, "Tepid", "tepid"],
  [25, "Warm", "warm"],
  [28, "Warm", "warm"],
  [29, "Hot", "hot"],
  [32, "Hot", "hot"],
  [33, "Very Hot", "very hot"],
  [38, "Very Hot", "very hot"],
  [39, "Dangerous Heat", "dangerously hot"],
  [45, "Dangerous Heat", "dangerously hot"],
  [46, "Extreme Heat", "extremely hot"],
];

describe("Comfort Perception ladder", () => {
  it("labels every band edge exactly as specified", () => {
    for (const [c, label] of BANDS) {
      expect(comfortPerception(c), `${c} °C`).toBe(label);
    }
  });

  it("gives every band a colour", () => {
    for (const [, label] of BANDS) {
      expect(comfortPerceptionColor(label), label).toMatch(/^hsl\(/);
    }
  });

  it("keeps the exercise-comfort sweet spot in the middle", () => {
    expect(comfortPerception(12)).toBe("Crisp");
    expect(comfortPerception(18)).toBe("Comfortable");
    expect(comfortPerception(24)).toBe("Tepid");
  });
});

describe("recap wording", () => {
  it("uses the same bands as the on-screen chip", () => {
    for (const [c, , phrase] of BANDS) {
      expect(feelWord(c), `${c} °C`).toBe(phrase);
    }
  });

  it("rounds to the nearest degree before picking a band", () => {
    expect(feelWord(5.6)).toBe("chilly");
    expect(feelWord(-10.4)).toBe("very cold");

  });

  it("picks the right article", () => {
    expect(aOrAn("extremely hot")).toBe("an");
    expect(aOrAn("dangerously cold")).toBe("a");
    expect(aOrAn("warm")).toBe("a");
  });
});
