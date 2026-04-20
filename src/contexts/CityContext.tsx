import { createContext, useContext, useState, ReactNode } from "react";

export interface SelectedCity {
  name: string;
  lat: number;
  lon: number;
}

interface CityContextValue {
  selectedCity: SelectedCity | null;
  setSelectedCity: (city: SelectedCity | null) => void;
}

const CityContext = createContext<CityContextValue | null>(null);

export const CityProvider = ({ children }: { children: ReactNode }) => {
  const [selectedCity, setSelectedCity] = useState<SelectedCity | null>(null);
  return (
    <CityContext.Provider value={{ selectedCity, setSelectedCity }}>
      {children}
    </CityContext.Provider>
  );
};

export function useSelectedCity(): CityContextValue {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error("useSelectedCity must be used inside CityProvider");
  return ctx;
}
