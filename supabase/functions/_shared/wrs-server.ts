// Server-side port of the WRS scoring in src/lib/wrs.ts.
// Only the final 0-100 threat level is needed for notifications, so the
// formatting / colour logic is omitted. Weights and gates mirror the client
// exactly so a push never disagrees with what the user sees on screen.

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const W = { cape: 37.5, shear: 31.25, el: 18.75, lcl: 12.5 };
const PHYS_W = { sfc: 0.5, mid: 0.35, lapse: 0.15 };

export interface Sounding {
  cape: number | null;
  cin: number | null;
  lcl: number | null;
  el: number | null;
  shear: number | null;
  rhSurface: number | null;
  rhMid: number | null;
  lapseMid: number | null;
}

export function wrsFromSounding(s: Sounding): number {
  const capeScore = s.cape != null ? clamp01(s.cape / 4000) : 0;
  const cinMag = s.cin != null ? Math.abs(s.cin) : 0;
  const shearScore = s.shear != null ? clamp01(s.shear / 20) : 0;
  const lclScore = s.lcl != null ? clamp01(1 - s.lcl / 2000) : 0;
  const elScore = s.el != null ? clamp01((s.el - 4000) / 10000) : 0;

  const rhSfcScore = s.rhSurface != null ? clamp01((s.rhSurface - 30) / 70) : 0;
  const rhMidScore = s.rhMid != null ? clamp01((s.rhMid - 20) / 60) : 0;
  const lapseScore = s.lapseMid != null ? clamp01((s.lapseMid - 5.5) / 3) : 0;

  const capeGate = Math.log(1 + 9 * capeScore) / Math.log(10);
  const cinGate =
    s.cin == null ? 1 : clamp01(1 - Math.log(1 + 9 * clamp01(cinMag / 200)) / Math.log(10));
  const effectiveGate = capeGate * cinGate;

  const physScore = clamp01(
    PHYS_W.sfc * rhSfcScore + PHYS_W.mid * rhMidScore + PHYS_W.lapse * lapseScore,
  );
  const physGate = Math.log(1 + 9 * physScore) / Math.log(10);

  const capeContrib = Math.round(capeScore * W.cape * physGate);
  const shearContrib = Math.round(shearScore * W.shear * effectiveGate * physGate);
  const lclContrib = Math.round(lclScore * W.lcl * effectiveGate * physGate);
  const elContrib = Math.round(elScore * W.el * effectiveGate * physGate);
  const virtualBundle = shearScore * W.shear + lclScore * W.lcl + elScore * W.el;
  const cinLoss = Math.round(capeGate * physGate * virtualBundle * (1 - cinGate));

  return Math.min(
    100,
    Math.max(0, capeContrib + shearContrib + lclContrib + elContrib - cinLoss),
  );
}

/** Fetches the Open-Meteo inputs the WRS model needs for one coordinate. */
export async function fetchSounding(lat: number, lon: number): Promise<Sounding | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,dewpoint_2m,relative_humidity_2m,cape,convective_inhibition,lifted_index` +
    `&hourly=relative_humidity_700hPa,temperature_700hPa,temperature_500hPa,` +
    `geopotential_height_700hPa,geopotential_height_500hPa,` +
    `wind_speed_850hPa,wind_direction_850hPa,wind_speed_500hPa,wind_direction_500hPa` +
    `&wind_speed_unit=ms&forecast_days=1&timezone=UTC`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const c = json?.current ?? {};
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

  const t2m = num(c.temperature_2m);
  const td2m = num(c.dewpoint_2m);
  const lcl = t2m != null && td2m != null ? 125 * (t2m - td2m) : null;

  const times: string[] = json?.hourly?.time ?? [];
  const nowHr = new Date().toISOString().slice(0, 13);
  let idx = times.findIndex((t) => t.startsWith(nowHr));
  if (idx < 0) idx = 0;
  const pick = (key: string): number | null => {
    const arr: Array<number | null> = json?.hourly?.[key] ?? [];
    const v = arr[idx];
    return typeof v === "number" ? v : null;
  };

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
    const toUV = (speed: number, dir: number) => {
      const rad = ((dir + 180) * Math.PI) / 180;
      return { u: speed * Math.sin(rad), v: speed * Math.cos(rad) };
    };
    const a = toUV(s850, d850);
    const b = toUV(s500, d500);
    shear = Math.hypot(b.u - a.u, b.v - a.v);
  }

  const cape = num(c.cape);
  const li = num(c.lifted_index);
  let el: number | null = null;
  if (cape != null && lcl != null) {
    const buoyancyDepth = Math.sqrt(Math.max(0, cape)) * 55;
    const liBoost = li != null && li < 0 ? Math.min(-li, 12) * 700 : 0;
    el = Math.max(0, Math.min(16000, lcl + buoyancyDepth + liBoost));
  }

  const cinRaw = num(c.convective_inhibition);
  return {
    cape,
    cin: cinRaw == null ? null : cinRaw > 0 ? -cinRaw : cinRaw,
    lcl,
    el,
    shear,
    rhSurface: num(c.relative_humidity_2m),
    rhMid: pick("relative_humidity_700hPa"),
    lapseMid,
  };
}
