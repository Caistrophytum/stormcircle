/**
 * RadarContext — shares a single useRadar() instance across the app.
 * Also handles the "on first load, pan to nearest station of user's home city"
 * side effect that used to live inside TacticalMap.
 */
import { createContext, useContext, useEffect, useRef, ReactNode } from "react";
import { useRadar } from "@/hooks/useRadar";
import { useAuth } from "@/hooks/useAuth";
import { useHomeCityRisk } from "@/hooks/useHomeCityRisk";

type RadarValue = ReturnType<typeof useRadar>;

const RadarContext = createContext<RadarValue | null>(null);

export function RadarProvider({ children }: { children: ReactNode }) {
  const value = useRadar();
  const { profile } = useAuth();
  const home = useHomeCityRisk(profile?.location ?? null);
  const pannedRef = useRef(false);

  useEffect(() => {
    if (pannedRef.current) return;
    if (value.selectedCity) return;
    if (!home.coords || !profile?.location) return;
    pannedRef.current = true;
    const cityName = profile.location.split(",")[0].trim();
    value.setSelectedCity({ name: cityName, lat: home.coords.lat, lon: home.coords.lon });
  }, [home.coords, profile?.location, value]);

  return <RadarContext.Provider value={value}>{children}</RadarContext.Provider>;
}

export function useRadarContext(): RadarValue {
  const ctx = useContext(RadarContext);
  if (!ctx) throw new Error("useRadarContext must be used inside RadarProvider");
  return ctx;
}
