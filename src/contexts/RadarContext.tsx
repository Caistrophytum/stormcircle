/**
 * RadarContext — shares a single useRadar() instance across the whole app so
 * multiple consumers (MetricsTab via useWRSMetrics, RadarReportsTab, TacticalMap)
 * see the same selected station / product / tile URL.
 */
import { createContext, useContext, ReactNode } from "react";
import { useRadar } from "@/hooks/useRadar";

type RadarValue = ReturnType<typeof useRadar>;

const RadarContext = createContext<RadarValue | null>(null);

export function RadarProvider({ children }: { children: ReactNode }) {
  const value = useRadar();
  return <RadarContext.Provider value={value}>{children}</RadarContext.Provider>;
}

export function useRadarContext(): RadarValue {
  const ctx = useContext(RadarContext);
  if (!ctx) throw new Error("useRadarContext must be used inside RadarProvider");
  return ctx;
}
