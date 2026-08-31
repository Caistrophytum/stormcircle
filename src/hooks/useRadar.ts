/**
 * useRadar - single source of truth for the radar overlay and map anchor.
 *
 * Rule: a US location pans to its nearest NEXRAD site (per-site products);
 * a European/Israeli location shows the OPERA-area composite centred on the
 * location itself; the manual toggle overrides that choice either way.
 *
 * Both regions refresh on the shared 60-second clock (`useRefreshTick`), so
 * NEXRAD tiles and the European composite update in lockstep.
 */
import { useState, useMemo, useEffect } from "react";
import { RadarStation } from "@/config/radarStations";
import { findNearestStation } from "@/lib/nearestStation";
import { useSelectedCity, SelectedCity as CtxSelectedCity } from "@/contexts/CityContext";
import { searchGeocode } from "@/lib/openMeteo";
import { useHometownCoords } from "@/hooks/useHometownCoords";
import { useRefreshTick } from "@/hooks/useRefreshTick";
import {
  isInEuRadarCoverage,
  fetchLatestEuRadarFrame,
  euRadarTileUrl,
  EuRadarFrame,
} from "@/lib/euRadar";

/** Washington DC - last-resort anchor when no location at all is known. */
const DC = { lat: 38.9072, lon: -77.0369 };

/**
 * True when a coordinate sits inside NEXRAD coverage (CONUS, Alaska, Hawaii).
 * `countryCode` is often missing on saved hometowns and legacy selections, so
 * the coordinates - never a defaulted country code - decide the region.
 */
function isUsCoord(lat: number, lon: number): boolean {
  return (
    (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) ||
    (lat >= 51 && lat <= 72 && lon >= -170 && lon <= -129) ||
    (lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154)
  );
}

/** Open-Meteo returns admin1 as the full state name; NEXRAD station labels
 *  use the 2-letter USPS code. Map full-name → abbrev for state matching. */
const US_STATE_ABBREV: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

export type ProductCode = "N0B" | "N0U" | "N0S" | "N0Z" | "NET";

export interface RadarProduct {
  code: ProductCode;
  label: string;
}

export const PRODUCTS: RadarProduct[] = [
  { code: "N0B", label: "Base Reflectivity" },
  { code: "N0U", label: "Base Velocity" },
  { code: "N0S", label: "Storm Relative Velocity" },
  { code: "N0Z", label: "Base Reflectivity 248nm" },
  { code: "NET", label: "Net Echo Tops" },
];

export interface SelectedCity {
  name: string;
  lat: number;
  lon: number;
  countryCode?: string;
}

export function useRadar() {
  const { selectedCity, setSelectedCity: setCtxCity } = useSelectedCity();
  const homeCoords = useHometownCoords();
  const tick = useRefreshTick();
  const [selectedStation, setSelectedStation] = useState<RadarStation | null>(null);
  const [stationDistanceKm, setStationDistanceKm] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductCode | null>(null);

  // Radar focus: the selected city, else the signed-in user's saved hometown.
  const focus: SelectedCity | null = selectedCity
    ? { ...selectedCity }
    : homeCoords
      ? { name: "Hometown", ...homeCoords }
      : null;

  // Region: coordinates decide, a manual toggle can override.
  const [modeOverride, setModeOverride] = useState<"us" | "eu" | null>(null);
  const autoRegion: "us" | "eu" | null = !focus
    ? null
    : isUsCoord(focus.lat, focus.lon) || (focus.countryCode ?? "").toUpperCase() === "US"
      ? "us"
      : isInEuRadarCoverage(focus.lat, focus.lon)
        ? "eu"
        : null;
  const euMode = (modeOverride ?? autoRegion ?? "us") === "eu";
  const toggleRadarMode = () => setModeOverride(euMode ? "us" : "eu");

  // European composite frame, refreshed on the shared 60 s clock. A failed
  // fetch keeps the previous frame on screen instead of blanking the overlay.
  const [euFrame, setEuFrame] = useState<EuRadarFrame | null>(null);
  useEffect(() => {
    if (!euMode) return;
    let cancelled = false;
    void (async () => {
      const frame = await fetchLatestEuRadarFrame();
      if (!cancelled && frame) setEuFrame(frame);
    })();
    return () => {
      cancelled = true;
    };
  }, [euMode, tick]);

  // Map anchor: EU/Israel centres the composite on the focus itself; US pans
  // to the nearest NEXRAD site (focus -> US hometown -> Washington DC).
  useEffect(() => {
    if (!focus) {
      setSelectedStation(null);
      setStationDistanceKm(null);
      return;
    }

    if (euMode) {
      setSelectedStation({ id: "EU-COMPOSITE", name: focus.name, lat: focus.lat, lon: focus.lon });
      setStationDistanceKm(null);
      setSelectedProduct(null);
      return;
    }

    const focusIsUS = isUsCoord(focus.lat, focus.lon);
    const anchor = focusIsUS
      ? focus
      : homeCoords && isUsCoord(homeCoords.lat, homeCoords.lon)
        ? homeCoords
        : DC;
    const { station, distanceKm } = findNearestStation(anchor.lat, anchor.lon);
    setSelectedStation(station);
    setStationDistanceKm(focusIsUS ? distanceKm : null);
    setSelectedProduct("N0B");
  }, [
    euMode,
    focus?.lat,
    focus?.lon,
    focus?.name,
    homeCoords?.lat,
    homeCoords?.lon,
  ]);

  const setSelectedCity = (city: CtxSelectedCity | null) => {
    setCtxCity(city);
  };

  /**
   * Marker-click handler: when the user picks a radar station directly on the
   * map, resolve the station's home city via Open-Meteo geocoding and adopt it
   * as the selectedCity so all weather/sounding parameters refresh for that
   * location. Falls back to the station's own coordinates if geocoding fails.
   */
  const selectStationByMarker = async (station: RadarStation) => {
    // Optimistic: switch station immediately so the radar overlay/recenter fires.
    setSelectedStation(station);
    setStationDistanceKm(0);

    // station.name is "City, ST" - the second token is the US state abbrev
    // (e.g. "FL" for KMLB). We MUST constrain the reverse-geocode to US +
    // that state, otherwise homonyms like Melbourne, AU or Birmingham, UK
    // silently outrank Melbourne, FL / Birmingham, AL and hijack the map.
    const parts = station.name.split(",").map((s) => s.trim());
    const cityName = parts[0];
    const stateAbbrev = (parts[1] ?? "").split("/")[0].trim().toUpperCase();
    try {
      const results = await searchGeocode(cityName, 8);
      const usResults = results.filter(
        (r) => (r.country_code ?? "").toUpperCase() === "US",
      );
      const hit =
        (stateAbbrev &&
          usResults.find(
            (r) => US_STATE_ABBREV[(r.admin1 ?? "").toLowerCase()] === stateAbbrev,
          )) ||
        usResults[0];
      if (hit) {
        setCtxCity({
          name: hit.name,
          lat: hit.latitude,
          lon: hit.longitude,
          countryCode: "US",
        });
        return;
      }
    } catch (err) {
      console.warn("[useRadar] reverse geocode failed, using station coords", err);
    }
    // Fallback: use the station's own coordinates as the "city" (CONUS station).
    setCtxCity({ name: cityName, lat: station.lat, lon: station.lon, countryCode: "US" });
  };

  const tileUrl = useMemo(() => {
    if (euMode) return euRadarTileUrl(euFrame);
    if (!selectedStation || !selectedProduct) return null;
    const tileId = selectedStation.id.replace(/^K/, "");
    return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${tileId}-${selectedProduct}-0/{z}/{x}/{y}.png`;
  }, [euMode, euFrame, selectedStation, selectedProduct]);

  return {
    selectedCity,
    setSelectedCity,
    selectedStation,
    setSelectedStation,
    selectStationByMarker,
    stationDistanceKm,
    selectedProduct,
    setSelectedProduct,
    tileUrl,
    /** True when the European composite is being shown instead of NEXRAD. */
    euMode,
    /** Flips between the European composite and the NEXRAD mosaic. */
    toggleRadarMode,
    /** Unix seconds of the displayed European frame (null in NEXRAD mode). */
    euFrameTime: euFrame?.time ?? null,

  };
}
