import { describe, expect, it } from "vitest";
import { currentHourIndex, hourlySurface, parseSounding } from "./soundingParse";

const hourly = {
  time: ["2026-11-06T14:00", "2026-11-06T15:00"],
  temperature_2m: [20, 30],
  dewpoint_2m: [10, 22],
  relative_humidity_2m: [50, 60],
  cape: [100, 2500],
  convective_inhibition: [20, 0],
  lifted_index: [1, -4],
  boundary_layer_height: [800, 1500],
  relative_humidity_700hPa: [40, 70],
  vertical_velocity_700hPa: [0, 0.2],
  temperature_700hPa: [5, 8],
  temperature_500hPa: [-12, -14],
  geopotential_height_700hPa: [3000, 3000],
  geopotential_height_500hPa: [5600, 5600],
  wind_speed_850hPa: [5, 10],
  wind_direction_850hPa: [180, 180],
  wind_speed_500hPa: [5, 30],
  wind_direction_500hPa: [180, 270],
};

describe("forecast sounding parser", () => {
  it("forecast hour parses the same as live when surface values match", () => {
    const current = hourlySurface(hourly, 0);
    expect(parseSounding(hourlySurface(hourly, 0), hourly, 0)).toEqual(parseSounding(current, hourly, 0));
  });

  it("uses the requested hour's values", () => {
    const s = parseSounding(hourlySurface(hourly, 1), hourly, 1);
    expect(s.cape).toBe(2500);
    expect(s.lcl).toBe(1000);
    expect(s.rhMid).toBe(70);
    expect(s.shear).toBeCloseTo(Math.hypot(30, 10), 5);
  });

  it("CIN is always negative", () => {
    expect(parseSounding(hourlySurface(hourly, 0), hourly, 0).cin).toBe(-20);
  });

  it("finds the current UTC hour", () => {
    expect(currentHourIndex(hourly.time, new Date("2026-11-06T15:42:00Z"))).toBe(1);
  });
});
