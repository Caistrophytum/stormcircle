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
import { createContext, useContext, useMemo, useState, ReactNode } from "react";

export interface SelectedCity {
  name: string;
  lat: number;
  lon: number;
  /** ISO-3166-1 alpha-2. Used by the radar to fall back to a CONUS
   *  station (Washington DC) when the picked city is outside the US. */
  countryCode?: string;
}

interface CityContextValue {
  selectedCity: SelectedCity | null;
  setSelectedCity: (city: SelectedCity | null) => void;
}

const CityContext = createContext<CityContextValue | null>(null);

/** Wrap your tree in this once (we do it inside Index.tsx). */
export const CityProvider = ({ children }: { children: ReactNode }) => {
  const [selectedCity, setSelectedCity] = useState<SelectedCity | null>(null);
  // Perf: memoize the context value so consumers don't re-render on every
  // parent render just because we allocated a fresh `{ selectedCity, ... }`
  // object. `setSelectedCity` is stable across renders (from useState).
  const value = useMemo(() => ({ selectedCity, setSelectedCity }), [selectedCity]);
  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
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
