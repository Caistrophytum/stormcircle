/**
 * Shared Open-Meteo geocoding helpers. All four callers (useHomeCityRisk,
 * useReportDistances, useCitySearch, useRadar) were each rebuilding the
 * same URL and parsing pattern.
 *
 *   • searchGeocode(name, count) — raw API call, returns the results array
 *   • pickByStateLabel(label, results) — picks the result whose admin1
 *     matches the second comma-separated token of `label` (state), else
 *     falls back to the first result.
 */
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export interface GeocodeResult {
  id?: number;
  name: string;
  admin1?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
  [key: string]: unknown;
}

export async function searchGeocode(
  name: string,
  count = 5,
): Promise<GeocodeResult[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];
  // Global search — Open-Meteo geocoder covers every city worldwide.
  // The radar module handles US-only NEXRAD by falling back to Washington DC
  // when a non-US city is selected.
  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(trimmed)}&count=${count}&language=en&format=json`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.results ?? []) as GeocodeResult[];
}

// NOTE: A shared `formatCityLabel` helper used to live here. All four call
// sites (RadarControls, MobileRadar, LocationPicker, CitizenReports) inline
// their own equivalent formatting today, so the helper was removed. If a
// third place needs the same label, re-export a helper here rather than
// copy-pasting a fourth variant.


/**
 * Resolve a saved label to coordinates + country. Prefers an admin1/state
 * match when the label carries one, then falls back to a country-code match
 * on the trailing token, then the first result.
 */
export async function geocodeLabel(
  label: string,
): Promise<{ lat: number; lon: number; countryCode?: string } | null> {
  const tokens = label.split(",").map((s) => s.trim()).filter(Boolean);
  const name = tokens[0];
  if (!name) return null;
  try {
    const results = await searchGeocode(name, 5);
    if (!results.length) return null;
    const trailing = (tokens[tokens.length - 1] ?? "").toLowerCase();
    const admin = tokens[1]?.toLowerCase();
    const match =
      (trailing.length === 2 &&
        results.find((r) => (r.country_code ?? "").toLowerCase() === trailing)) ||
      (admin && results.find((r) => (r.admin1 ?? "").toLowerCase() === admin)) ||
      results[0];
    return {
      lat: match.latitude,
      lon: match.longitude,
      countryCode: (match.country_code ?? "").toUpperCase() || undefined,
    };
  } catch {
    return null;
  }
}
