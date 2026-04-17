import { useState, useMemo } from "react";
import { RadarStation } from "@/config/radarStations";

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

export function useRadar() {
  const [selectedStation, setSelectedStation] = useState<RadarStation | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductCode | null>(null);

  const tileUrl = useMemo(() => {
    if (!selectedStation || !selectedProduct) return null;
    // IEM tile service expects the 3-letter station code (strip leading "K")
    const tileId = selectedStation.id.replace(/^K/, "");
    return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${tileId}-${selectedProduct}-0/{z}/{x}/{y}.png`;
  }, [selectedStation, selectedProduct]);

  return {
    selectedStation,
    setSelectedStation,
    selectedProduct,
    setSelectedProduct,
    tileUrl,
  };
}
