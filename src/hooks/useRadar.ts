import { useState, useMemo, useEffect } from "react";
import { RadarStation } from "@/config/radarStations";
import { findNearestStation } from "@/lib/nearestStation";
import { useSelectedCity, SelectedCity as CtxSelectedCity } from "@/contexts/CityContext";

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
}

export function useRadar() {
  const { selectedCity, setSelectedCity: setCtxCity } = useSelectedCity();
  const [selectedStation, setSelectedStation] = useState<RadarStation | null>(null);
  const [stationDistanceKm, setStationDistanceKm] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductCode | null>(null);

  // Keep nearest-station state in sync with the shared selectedCity.
  useEffect(() => {
    if (selectedCity) {
      const { station, distanceKm } = findNearestStation(selectedCity.lat, selectedCity.lon);
      setSelectedStation(station);
      setStationDistanceKm(distanceKm);
    } else {
      setSelectedStation(null);
      setStationDistanceKm(null);
    }
  }, [selectedCity?.lat, selectedCity?.lon]);

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

    // station.name is "City, ST" — strip the state suffix for geocoding.
    const cityName = station.name.split(",")[0].trim();
    try {
      const url =
        `https://geocoding-api.open-meteo.com/v1/search` +
        `?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json&countryCode=US`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Geocoding ${res.status}`);
      const json = await res.json();
      const hit = json?.results?.[0];
      if (hit) {
        setCtxCity({ name: hit.name, lat: hit.latitude, lon: hit.longitude });
        return;
      }
    } catch (err) {
      console.warn("[useRadar] reverse geocode failed, using station coords", err);
    }
    // Fallback: use the station's own coordinates as the "city".
    setCtxCity({ name: cityName, lat: station.lat, lon: station.lon });
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
