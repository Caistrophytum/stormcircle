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
  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(trimmed)}&count=${count}&language=en&format=json&countryCode=US`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.results ?? []) as GeocodeResult[];
}

/**
 * Resolve a "City, State" label to coordinates, preferring an admin1
 * (state) match when the label includes a state token.
 */
export async function geocodeLabel(
  label: string,
): Promise<{ lat: number; lon: number } | null> {
  const [name] = label.split(",").map((s) => s.trim());
  if (!name) return null;
  try {
    const results = await searchGeocode(name, 5);
    if (!results.length) return null;
    const state = label.split(",").map((s) => s.trim().toLowerCase())[1];
    const match =
      (state && results.find((r) => (r.admin1 ?? "").toLowerCase() === state)) ||
      results[0];
    return { lat: match.latitude, lon: match.longitude };
  } catch {
    return null;
  }
}
