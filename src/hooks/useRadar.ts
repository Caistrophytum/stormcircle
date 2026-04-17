import { useState, useMemo } from "react";
import { RadarStation } from "@/config/radarStations";

export type ProductCode = "N0Q" | "N0U" | "N0C" | "N0X" | "N0K" | "N0H";

export interface RadarProduct {
  code: ProductCode;
  label: string;
}

export const PRODUCTS: RadarProduct[] = [
  { code: "N0Q", label: "Base Reflectivity" },
  { code: "N0U", label: "Base Velocity" },
  { code: "N0C", label: "Correlation Coefficient" },
  { code: "N0X", label: "Differential Reflectivity" },
  { code: "N0K", label: "Specific Diff. Phase" },
  { code: "N0H", label: "Hydrometeor Class" },
];

export function useRadar() {
  const [selectedStation, setSelectedStation] = useState<RadarStation | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductCode | null>(null);

  const tileUrl = useMemo(() => {
    if (!selectedStation || !selectedProduct) return null;
    return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${selectedStation.id}-${selectedProduct}-0/{z}/{x}/{y}.png`;
  }, [selectedStation, selectedProduct]);

  return {
    selectedStation,
    setSelectedStation,
    selectedProduct,
    setSelectedProduct,
    tileUrl,
  };
}
