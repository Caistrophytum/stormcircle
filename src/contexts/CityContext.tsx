/**
 * CityContext — global "currently focused city" state.
 *
 * The user can pick a city via the search box in StatusBar; the map and
 * weather panels then re-center / re-fetch around that city's lat/lon.
 * Storing it in context (rather than passing props) keeps the components
 * decoupled and lets any descendant subscribe.
 *
 * `null` means "no city picked" — components fall back to a default
 * (e.g. user's geolocation or a hardcoded center).
 */
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

/** Wrap your tree in this once (we do it inside Index.tsx). */
export const CityProvider = ({ children }: { children: ReactNode }) => {
  const [selectedCity, setSelectedCity] = useState<SelectedCity | null>(null);
  return (
    <CityContext.Provider value={{ selectedCity, setSelectedCity }}>
      {children}
    </CityContext.Provider>
  );
};

/**
 * Read the currently selected city. Throws if used outside <CityProvider>
 * so misuse fails loudly instead of silently returning undefined.
 */
export function useSelectedCity(): CityContextValue {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error("useSelectedCity must be used inside CityProvider");
  return ctx;
}
