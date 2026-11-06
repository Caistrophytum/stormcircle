/**
 * Pure Open-Meteo → WRS sounding parser, shared by the live sounding and the
 * 24-hour forecast slider so both feed computeWRS identical shapes.
 */
export interface ParsedSounding {
  cape: number | null;
  cin: number | null;
  li: number | null;
  blh: number | null;
  lcl: number | null;
  el: number | null;
  rhSurface: number | null;
  rhMid: number | null;
  omegaMid: number | null;
  lapseMid: number | null;
  shear: number | null;
}

/** Variables needed on `hourly` for the pressure-level inputs. */
export const HOURLY_UPPER =
  "relative_humidity_700hPa,vertical_velocity_700hPa,temperature_700hPa,temperature_500hPa,geopotential_height_700hPa,geopotential_height_500hPa,wind_speed_850hPa,wind_direction_850hPa,wind_speed_500hPa,wind_direction_500hPa";
/** Surface variables (on `current` for live, `hourly` for forecast). */
export const SURFACE_VARS =
  "temperature_2m,dewpoint_2m,relative_humidity_2m,cape,convective_inhibition,lifted_index,boundary_layer_height";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * @param surface object with SURFACE_VARS keys (json.current, or an hourly slice)
 * @param hourly  json.hourly
 * @param idx     hourly index for the pressure-level samples
 */
export function parseSounding(surface: Record<string, unknown>, hourly: any, idx: number): ParsedSounding {
  const h = hourly ?? {};
  const pick = (key: string) => num(h[key]?.[idx]);
  const t2m = num(surface.temperature_2m);
  const td2m = num(surface.dewpoint_2m);
  const lcl = t2m != null && td2m != null ? 125 * (t2m - td2m) : null;

  const t700 = pick("temperature_700hPa");
  const t500 = pick("temperature_500hPa");
  const z700 = pick("geopotential_height_700hPa");
  const z500 = pick("geopotential_height_500hPa");
  let lapseMid: number | null = null;
  if (t700 != null && t500 != null) {
    const dzKm = z700 != null && z500 != null && z500 > z700 ? (z500 - z700) / 1000 : 2.562;
    lapseMid = (t700 - t500) / dzKm;
  }

  const s850 = pick("wind_speed_850hPa");
  const d850 = pick("wind_direction_850hPa");
  const s500 = pick("wind_speed_500hPa");
  const d500 = pick("wind_direction_500hPa");
  let shear: number | null = null;
  if (s850 != null && d850 != null && s500 != null && d500 != null) {
    const toUV = (s: number, d: number) => {
      const rad = ((d + 180) * Math.PI) / 180;
      return { u: s * Math.sin(rad), v: s * Math.cos(rad) };
    };
    const a = toUV(s850, d850);
    const b = toUV(s500, d500);
    shear = Math.hypot(b.u - a.u, b.v - a.v);
  }

  const cape = num(surface.cape);
  const li = num(surface.lifted_index);
  let el: number | null = null;
  if (cape != null && lcl != null) {
    const buoyancyDepth = Math.sqrt(Math.max(0, cape)) * 55;
    const liBoost = li != null && li < 0 ? Math.min(-li, 12) * 700 : 0;
    el = Math.max(0, Math.min(16000, lcl + buoyancyDepth + liBoost));
  }
  const cinRaw = num(surface.convective_inhibition);

  return {
    cape,
    cin: cinRaw == null ? null : cinRaw > 0 ? -cinRaw : cinRaw,
    li,
    blh: num(surface.boundary_layer_height),
    lcl,
    el,
    rhSurface: num(surface.relative_humidity_2m),
    rhMid: pick("relative_humidity_700hPa"),
    omegaMid: pick("vertical_velocity_700hPa"),
    lapseMid,
    shear,
  };
}

/** Surface fields of hourly index `idx`, shaped like `json.current`. */
export function hourlySurface(hourly: any, idx: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SURFACE_VARS.split(",")) out[k] = hourly?.[k]?.[idx];
  return out;
}

/** Index of the hourly slot for the current UTC hour (0 if absent). */
export function currentHourIndex(times: string[], now = new Date()): number {
  const key = now.toISOString().slice(0, 13);
  const i = times.findIndex((t) => t.startsWith(key));
  return i >= 0 ? i : 0;
}
