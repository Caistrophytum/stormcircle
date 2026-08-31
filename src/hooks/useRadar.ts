import { useState, useMemo, useEffect } from "react";
import { RadarStation } from "@/config/radarStations";
import { findNearestStation } from "@/lib/nearestStation";
import { useSelectedCity, SelectedCity as CtxSelectedCity } from "@/contexts/CityContext";
import { searchGeocode } from "@/lib/openMeteo";
import { useHometownCoords } from "@/hooks/useHometownCoords";
import {

  isInEuRadarCoverage,
  fetchLatestEuRadarFrame,
  euRadarTileUrl,
  EuRadarFrame,
} from "@/lib/euRadar";


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
  const [selectedStation, setSelectedStation] = useState<RadarStation | null>(null);
  const [stationDistanceKm, setStationDistanceKm] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductCode | null>(null);

  // Radar focus: the selected city when there is one, otherwise the signed-in
  // user's saved hometown. Washington DC is only used when neither is known.
  const focus: SelectedCity | null = selectedCity
    ? {
        name: selectedCity.name,
        lat: selectedCity.lat,
        lon: selectedCity.lon,
        countryCode: selectedCity.countryCode,
      }
    : homeCoords
      ? {
          name: "Hometown",
          lat: homeCoords.lat,
          lon: homeCoords.lon,
          countryCode: homeCoords.countryCode,
        }
      : null;

  // European (non-US) radar composite. When the focus sits outside the US but
  // inside the OPERA/European coverage box we drop NEXRAD entirely and show the
  // European composite anchored on the focus itself.
  const euMode =
    !!focus &&
    (focus.countryCode ?? "US").toUpperCase() !== "US" &&
    isInEuRadarCoverage(focus.lat, focus.lon);

  const [euFrame, setEuFrame] = useState<EuRadarFrame | null>(null);

  useEffect(() => {
    if (!euMode) {
      setEuFrame(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const frame = await fetchLatestEuRadarFrame();
      if (!cancelled) setEuFrame(frame);
    };
    load();
    // Radar composites refresh every 10 minutes upstream.
    const id = window.setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [euMode]);

  // Keep nearest-station state in sync with the radar focus. The NEXRAD network
  // is CONUS-only, so a non-US focus outside European coverage falls back to the
  // hometown, and finally to Washington DC when no hometown is known.
  useEffect(() => {
    if (focus) {
      const isUS = (focus.countryCode ?? "US").toUpperCase() === "US";
      if (!isUS && isInEuRadarCoverage(focus.lat, focus.lon)) {
        // Anchor on the nearest physical OPERA site, exactly like NEXRAD in
        // the US. The imagery itself stays the European composite.
        const { station: euStation, distanceKm } = findNearestEuStation(focus.lat, focus.lon);
        setSelectedStation(euStation);
        setStationDistanceKm(Math.round(distanceKm));
        setSelectedProduct("N0B");
        return;
      }
      const anchor = isUS
        ? { lat: focus.lat, lon: focus.lon }
        : homeCoords && (homeCoords.countryCode ?? "US").toUpperCase() === "US"
          ? { lat: homeCoords.lat, lon: homeCoords.lon }
          : { lat: 38.9072, lon: -77.0369 }; // Washington, DC fallback
      const { station, distanceKm } = findNearestStation(anchor.lat, anchor.lon);
      setSelectedStation(station);
      setStationDistanceKm(isUS ? distanceKm : null);
      setSelectedProduct("N0B");
    } else {
      setSelectedStation(null);
      setStationDistanceKm(null);
    }
  }, [
    focus?.lat,
    focus?.lon,
    focus?.countryCode,
    homeCoords?.lat,
    homeCoords?.lon,
    homeCoords?.countryCode,
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

    // European site: no US reverse-geocode, just adopt the site as the city
    // so the composite (and all parameters) recenter on it.
    if (station.id.startsWith(EU_STATION_PREFIX)) {
      const eu = EU_RADAR_STATIONS.find((s) => s.id === station.id);
      const label = station.name.split(",")[0].trim();
      setCtxCity({
        name: label,
        lat: station.lat,
        lon: station.lon,
        countryCode: eu?.cc ?? "EU",
      });
      return;
    }

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
    /** Unix seconds of the displayed European frame (null in NEXRAD mode). */
    euFrameTime: euFrame?.time ?? null,
  };
}
