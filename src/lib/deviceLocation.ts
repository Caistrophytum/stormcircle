/**
 * deviceLocation — resolve the device's GPS position into a city label that
 * Open-Meteo can geocode back to coordinates.
 *
 * Shared by the mobile "Locate Me" button and the chat composer's
 * "My location" place option.
 */
import { searchGeocode } from "@/lib/openMeteo";

interface AdminEntry {
  name?: string;
  adminLevel?: number;
}

interface ReverseGeocodeResult {
  city?: string;
  locality?: string;
  localityInfo?: { administrative?: AdminEntry[] };
}

/** Match LocationPicker's formatCity so downstream label parsing is consistent. */
export function formatCity(name: string, admin1?: string, countryCode?: string): string {
  const cc = (countryCode ?? "").toUpperCase();
  if (cc && cc !== "US") return [name, admin1, cc].filter(Boolean).join(", ");
  return admin1 ? `${name}, ${admin1}` : name;
}

/** Great-circle distance (km) — guards against same-named cities elsewhere. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Walk candidate names (city → locality → admin hierarchy) for a resolvable one. */
async function pickResolvableCity(
  data: ReverseGeocodeResult,
  lat: number,
  lon: number,
): Promise<string | null> {
  const admins = (data.localityInfo?.administrative ?? [])
    .filter((a): a is AdminEntry & { name: string } => !!a.name)
    .sort((a, b) => (b.adminLevel ?? 0) - (a.adminLevel ?? 0))
    .map((a) => a.name);

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const c of [data.city, data.locality, ...admins]) {
    if (!c) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(c);
  }

  for (const name of candidates) {
    try {
      const results = await searchGeocode(name, 5);
      if (!results.length) continue;
      const nearest = results
        .map((r) => ({ r, d: haversineKm(lat, lon, r.latitude, r.longitude) }))
        .sort((a, b) => a.d - b.d)[0];
      if (nearest.d > 150) continue;
      return formatCity(nearest.r.name, nearest.r.admin1, nearest.r.country_code);
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/** Browser geolocation → reverse geocode → validated city label. Throws on failure. */
export async function resolveDeviceCity(): Promise<string> {
  if (!("geolocation" in navigator)) throw new Error("Geolocation is not available on this device.");

  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60_000,
    });
  }).catch((err: GeolocationPositionError) => {
    throw new Error(
      err.code === err.PERMISSION_DENIED
        ? "Location permission denied."
        : "Unable to retrieve your location.",
    );
  });

  const { latitude, longitude } = pos.coords;
  const res = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
  );
  if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`);
  const label = await pickResolvableCity((await res.json()) as ReverseGeocodeResult, latitude, longitude);
  if (!label) throw new Error("Could not identify a nearby known city.");
  return label;
}
