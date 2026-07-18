import { useState, useMemo, useEffect } from "react";
import { RadarStation } from "@/config/radarStations";
import { findNearestStation } from "@/lib/nearestStation";
import { useSelectedCity, SelectedCity as CtxSelectedCity } from "@/contexts/CityContext";
import { searchGeocode } from "@/lib/openMeteo";

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
  const [selectedStation, setSelectedStation] = useState<RadarStation | null>(null);
  const [stationDistanceKm, setStationDistanceKm] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductCode | null>(null);

  // Keep nearest-station state in sync with the shared selectedCity.
  // The NEXRAD radar network is CONUS-only, so when the selected city is
  // outside the US we anchor the radar to Washington DC as a default point
  // while weather / WRS keep using the real city coordinates.
  useEffect(() => {
    if (selectedCity) {
      const isUS = (selectedCity.countryCode ?? "US").toUpperCase() === "US";
      const anchor = isUS
        ? { lat: selectedCity.lat, lon: selectedCity.lon }
        : { lat: 38.9072, lon: -77.0369 }; // Washington, DC
      const { station, distanceKm } = findNearestStation(anchor.lat, anchor.lon);
      setSelectedStation(station);
      setStationDistanceKm(isUS ? distanceKm : null);
      setSelectedProduct("N0B");
    } else {
      setSelectedStation(null);
      setStationDistanceKm(null);
    }
  }, [selectedCity?.lat, selectedCity?.lon, selectedCity?.countryCode]);

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

    // station.name is "City, ST" — the second token is the US state abbrev
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
    if (!selectedStation || !selectedProduct) return null;
    const tileId = selectedStation.id.replace(/^K/, "");
    return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${tileId}-${selectedProduct}-0/{z}/{x}/{y}.png`;
  }, [selectedStation, selectedProduct]);

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
  };
}
