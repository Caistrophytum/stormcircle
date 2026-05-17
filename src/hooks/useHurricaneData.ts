/**
 * useHurricaneData — subscribes to the server-maintained `nhc_storms` table
 * via Realtime. The `nhc-poll` edge function fetches NHC CurrentStorms.json
 * on a 5-minute pg_cron schedule and writes one row per active storm.
 *
 * The Storm interface is unchanged so existing components keep working.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CLASSIFICATIONS: Record<string, string> = {
  TD: "Tropical Depression", TS: "Tropical Storm", HU: "Hurricane", TY: "Typhoon",
  STY: "Super Typhoon", TC: "Tropical Cyclone", STD: "Subtropical Depression",
  STS: "Subtropical Storm", EX: "Post-Tropical Cyclone", LO: "Low", DB: "Disturbance",
};

export interface Storm {
  id: string;
  name: string;
  classification: string;
  classificationLabel: string;
  dangerLevel: string;
  intensity: number;
  intensityMph: number;
  pressure: number;
  lat: number;
  lon: number;
  latStr: string;
  lonStr: string;
  movementDir: number;
  movementDirCompass: string;
  movementSpeed: number;
  lastUpdate: Date;
  advisoryUrl: string;
  discussionUrl: string;
  forecastGraphicsUrl: string;
  isDangerous: boolean;
}

export interface HurricaneSeason {
  active: boolean;
  basin: string;
}

export function isHurricaneSeason(): HurricaneSeason {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const atlantic = (month >= 6 && month <= 11) || (month === 5 && day >= 15);
  const pacific = month >= 5 && month <= 11;
  return {
    active: atlantic || pacific,
    basin: atlantic && pacific ? "Atlantic & Eastern Pacific"
      : atlantic ? "Atlantic"
      : pacific ? "Eastern Pacific"
      : "None",
  };
}

interface DbRow {
  storm_id: string;
  name: string;
  classification: string;
  classification_label: string;
  danger_level: string;
  intensity_kt: number;
  intensity_mph: number;
  pressure: number;
  lat: number | string;
  lon: number | string;
  lat_str: string;
  lon_str: string;
  movement_dir_compass: string;
  movement_speed: number | string;
  is_dangerous: boolean;
  advisory_url: string | null;
  discussion_url: string | null;
  forecast_graphics_url: string | null;
  last_update: string;
}

function rowToStorm(r: DbRow): Storm {
  return {
    id: r.storm_id,
    name: r.name,
    classification: r.classification,
    classificationLabel: r.classification_label ?? CLASSIFICATIONS[r.classification] ?? r.classification,
    dangerLevel: r.danger_level,
    intensity: r.intensity_kt,
    intensityMph: r.intensity_mph,
    pressure: r.pressure,
    lat: Number(r.lat),
    lon: Number(r.lon),
    latStr: r.lat_str,
    lonStr: r.lon_str,
    movementDir: 0,
    movementDirCompass: r.movement_dir_compass,
    movementSpeed: Number(r.movement_speed),
    lastUpdate: new Date(r.last_update),
    advisoryUrl: r.advisory_url ?? "",
    discussionUrl: r.discussion_url ?? "",
    forecastGraphicsUrl: r.forecast_graphics_url ?? "",
    isDangerous: r.is_dangerous,
  };
}

export interface HurricaneData {
  season: HurricaneSeason;
  storms: Storm[];
  dangerousStorms: Storm[];
  loading: boolean;
  lastAdvisory: Date | null;
}

export function useHurricaneData(): HurricaneData {
  const [storms, setStorms] = useState<Storm[]>([]);
  const [loading, setLoading] = useState(true);
  const seasonRef = useRef<HurricaneSeason>(isHurricaneSeason());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase.from("nhc_storms").select("*");
      if (cancelled) return;
      setStorms((data ?? []).map((r) => rowToStorm(r as DbRow)));
      setLoading(false);
    };
    void load();

    const channel = supabase
      .channel("nhc_storms_live")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "nhc_storms" },
        () => { void load(); })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  const dangerousStorms = storms.filter((s) => s.isDangerous);
  const lastAdvisory = storms.length > 0
    ? new Date(Math.max(...storms.map((s) => s.lastUpdate.getTime()))) : null;

  return { season: seasonRef.current, storms, dangerousStorms, loading, lastAdvisory };
}
