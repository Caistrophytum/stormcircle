import { useState, useMemo } from "react";
import { RadarStation } from "@/config/radarStations";
import { findNearestStation } from "@/lib/nearestStation";

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
  const [selectedCity, setSelectedCityState] = useState<SelectedCity | null>(null);
  const [selectedStation, setSelectedStation] = useState<RadarStation | null>(null);
  const [stationDistanceKm, setStationDistanceKm] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductCode | null>(null);

  const setSelectedCity = (city: SelectedCity | null) => {
    setSelectedCityState(city);
    if (city) {
      const { station, distanceKm } = findNearestStation(city.lat, city.lon);
      setSelectedStation(station);
      setStationDistanceKm(distanceKm);
    } else {
      setSelectedStation(null);
      setStationDistanceKm(null);
    }
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
    stationDistanceKm,
    selectedProduct,
    setSelectedProduct,
    tileUrl,
  };
}
