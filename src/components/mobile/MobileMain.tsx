/**
 * MobileMain — the mobile main-screen content stack.
 *
 * Top → bottom:
 *   1. Welcome [user] (or "Guest" when signed out)
 *   2. Hometown news bar (SPC risk in the user's saved home city)
 *   3. Latest SPC bot message (Day 1 Outlook)
 *   4. Environmental metrics (5 sounding nodes w/ WRS contributions)
 *   5. WRS bar (0–100)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHomeCityRisk, type SPCRiskLevel } from "@/hooks/useHomeCityRisk";
import { useRadar } from "@/hooks/useRadar";
import { useSoundingData } from "@/hooks/useSoundingData";
import { useWarningPolygons, type WarningPolygon } from "@/hooks/useWarningPolygons";
import { useUnitSystem, displayTemp, displayLengthM } from "@/hooks/useUnitSystem";
import { SystemMessageCard } from "@/components/SystemMessageCard";
import type { RawMessage } from "@/lib/reportGrouping";

const BOT_USER_ID = "00000000-0000-0000-0000-000000000000";


const RISK_TEXT: Record<SPCRiskLevel, string> = {
  NONE: "No Severe Risk",
  TSTM: "General Thunderstorm",
  MRGL: "Marginal Risk",
  SLGT: "Slight Risk",
  ENH: "Enhanced Risk",
  MDT: "Moderate Risk",
  HIGH: "High Risk",
};
const RISK_BG: Record<SPCRiskLevel, string> = {
  NONE: "hsl(120 45% 55%)",
  TSTM: "hsl(120 45% 55%)",
  MRGL: "hsl(120 60% 35%)",
  SLGT: "hsl(50 95% 50%)",
  ENH: "hsl(28 95% 50%)",
  MDT: "hsl(0 80% 45%)",
  HIGH: "hsl(280 70% 50%)",
};

function rankWarning(p: WarningPolygon): number | null {
  const ev = p.event;
  const text = `${p.description} ${p.headline}`.toLowerCase();
  const pds = /particularly dangerous situation|\bpds\b/.test(text);
  if (ev === "Tornado Warning") {
    if (text.includes("tornado emergency")) return 8;
    if (pds) return 7;
    return 6;
  }
  if (ev === "Flash Flood Warning") {
    if (text.includes("flash flood emergency")) return 5;
    return 2;
  }
  if (ev === "Severe Thunderstorm Warning") return pds ? 4 : 3;
  if (ev.endsWith("Warning")) return 1;
  return null;
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestVertexKm(
  origin: { lat: number; lon: number },
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number {
  const polys: number[][][][] =
    geom.type === "Polygon"
      ? [geom.coordinates as number[][][]]
      : (geom.coordinates as number[][][][]);
  let best = Infinity;
  for (const poly of polys) {
    if (!poly.length) continue;
    for (const [lon, lat] of poly[0]) {
      const d = haversineKm(origin, { lat, lon });
      if (d < best) best = d;
    }
  }
  return best;
}

interface SPCBotMessage {
  id: string;
  content: string;
  created_at: string;
}

function useSPCBotMessage() {
  const [msg, setMsg] = useState<SPCBotMessage | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id,content,created_at")
        .eq("user_id", BOT_USER_ID)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setMsg((data as SPCBotMessage | null) ?? null);
    };
    void load();
    const ch = supabase
      .channel("mobile-spc-bot")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${BOT_USER_ID}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, []);
  return msg;
}

interface ChatMessage {
  id: string;
  username: string;
  badge: string;
  content: string;
  created_at: string;
  user_id: string;
}

function useRecentChatMessages(limit = 30) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id,username,badge,content,created_at,user_id")
        .neq("user_id", BOT_USER_ID)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!cancelled && data) setMsgs((data as ChatMessage[]).slice().reverse());
    };
    void load();
    const ch = supabase
      .channel("mobile-main-chat")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => void load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [limit]);
  return msgs;
}

export default function MobileMain() {
  const { user, profile } = useAuth();
  const homeRisk = useHomeCityRisk(profile?.location ?? null);
  const radar = useRadar();
  const sounding = useSoundingData(
    radar.selectedCity ? { lat: radar.selectedCity.lat, lon: radar.selectedCity.lon } : null,
  );
  const unitSystem = useUnitSystem();
  const warningPolygons = useWarningPolygons();
  const botMsg = useSPCBotMessage();
  const [expandedKey, setExpandedKey] = useState<Set<string>>(new Set());
  const toggleKey = (id: string) =>
    setExpandedKey((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Pre-set radar to hometown on first load (parallel to desktop TacticalMap).
  const homePannedRef = useRef(false);
  useEffect(() => {
    if (homePannedRef.current) return;
    if (radar.selectedCity) return;
    if (!homeRisk.coords || !profile?.location) return;
    homePannedRef.current = true;
    const cityName = profile.location.split(",")[0].trim();
    radar.setSelectedCity({ name: cityName, lat: homeRisk.coords.lat, lon: homeRisk.coords.lon });
  }, [homeRisk.coords, profile?.location, radar]);

  const displayName = profile?.username ?? user?.email?.split("@")[0] ?? "Guest";

  // ── Sounding / WRS ───────────────────────────────────────────────
  const { nodes, threatLevel } = useMemo(() => {
    const stationActive = radar.selectedStation !== null && !sounding.loading;
    const fmt = (v: number | null, digits = 0) => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      return digits > 0 ? v.toFixed(digits) : Math.round(v).toLocaleString();
    };
    const fmtTemp = (v: number | null, digits = 1) => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      const d = displayTemp(v, unitSystem);
      return d ? d.value.toFixed(digits) : "ERR";
    };
    const fmtLenM = (v: number | null) => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      const d = displayLengthM(v, unitSystem);
      return d ? Math.round(d.value).toLocaleString() : "ERR";
    };
    const tempUnit = unitSystem === "metric" ? "°C" : "°F";
    const lenUnit = unitSystem === "metric" ? "m" : "ft";

    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const capeScore = sounding.cape != null ? clamp01(sounding.cape / 4000) : 0;
    const cinScore = sounding.cin != null ? clamp01(1 - Math.abs(sounding.cin) / 200) : 0;
    const liScore = sounding.li != null ? clamp01((6 - sounding.li) / 14) : 0;
    const blhScore = sounding.blh != null ? clamp01(sounding.blh / 3000) : 0;
    const lclScore = sounding.lcl != null ? clamp01(1 - sounding.lcl / 2000) : 0;

    const capeContrib = stationActive ? Math.round(capeScore * 35) : 0;
    const liContrib = stationActive ? Math.round(liScore * 25) : 0;
    const cinContrib = stationActive ? Math.round(cinScore * 15) : 0;
    const lclContrib = stationActive ? Math.round(lclScore * 15) : 0;
    const blhContrib = stationActive ? Math.round(blhScore * 10) : 0;

    const capeColor =
      !stationActive || sounding.cape === null
        ? "#7CFC00"
        : sounding.cape > 2500
          ? "#ff3b3b"
          : sounding.cape >= 1000
            ? "#ffd700"
            : "#7CFC00";
    const liColor =
      !stationActive || sounding.li === null
        ? "#7CFC00"
        : sounding.li < -6
          ? "#ff3b3b"
          : sounding.li < -3
            ? "#ff8c00"
            : sounding.li <= 0
              ? "#ffd700"
              : "#7CFC00";

    const nodes = [
      { label: "CAPE", value: fmt(sounding.cape), unit: "J/kg", color: capeColor, w: capeContrib },
      { label: "CIN", value: fmt(sounding.cin), unit: "J/kg", color: "#7CFC00", w: cinContrib },
      { label: "LI", value: fmtTemp(sounding.li, 1), unit: tempUnit, color: liColor, w: liContrib },
      { label: "BLH", value: fmtLenM(sounding.blh), unit: lenUnit, color: "#7CFC00", w: blhContrib },
      { label: "LCL", value: fmtLenM(sounding.lcl), unit: lenUnit, color: "#7CFC00", w: lclContrib },
    ];
    const threat = Math.min(100, capeContrib + liContrib + cinContrib + lclContrib + blhContrib);
    return { nodes, threatLevel: threat };
  }, [sounding, radar.selectedStation, unitSystem]);

  // ── Hometown bar text ────────────────────────────────────────────
  const nearestDanger = useMemo(() => {
    const coords = homeRisk.coords;
    if (!coords || warningPolygons.polygons.length === 0) return null;
    let bestRank = -1;
    let bestDist = Infinity;
    let bestEvent = "";
    for (const p of warningPolygons.polygons) {
      const r = rankWarning(p);
      if (r === null || r < bestRank) continue;
      const d = nearestVertexKm(coords, p.geometry);
      if (r > bestRank || d < bestDist) {
        bestRank = r;
        bestDist = d;
        const text = `${p.description} ${p.headline}`.toLowerCase();
        if (p.event === "Tornado Warning" && text.includes("tornado emergency")) bestEvent = "Tornado Emergency";
        else if (p.event === "Flash Flood Warning" && text.includes("flash flood emergency")) bestEvent = "Flash Flood Emergency";
        else if (/particularly dangerous situation|\bpds\b/.test(text)) bestEvent = `PDS ${p.event}`;
        else bestEvent = p.event;
      }
    }
    if (bestRank < 0) return null;
    return { event: bestEvent, distanceKm: bestDist };
  }, [warningPolygons.polygons, homeRisk.coords]);

  const hasLocation = !!profile?.location;
  const hometownBg = hasLocation ? RISK_BG[homeRisk.risk] : "hsl(0 80% 45%)";
  let hometownText: string;
  if (!user) {
    hometownText = "Sign in and set a hometown in your account center to see local risk.";
  } else if (!hasLocation) {
    hometownText = "Please choose a hometown from the account center portal.";
  } else {
    hometownText = `Now in your home city of ${profile!.location}: ${RISK_TEXT[homeRisk.risk]}.`;
    if (nearestDanger) {
      const km = nearestDanger.distanceKm;
      const useMiles = unitSystem === "imperial";
      const val = useMiles ? km * 0.621371 : km;
      const unit = useMiles ? "mi" : "km";
      const formatted = val < 10 ? val.toFixed(1) : Math.round(val).toLocaleString();
      hometownText += `\n\nNearest ${nearestDanger.event}: ${formatted} ${unit} away.`;
    }
  }

  // SPC bot rendering is delegated to SystemMessageCard (handles markers, payload, dropdowns).


  const threatColor =
    threatLevel > 85 ? "#ff3b3b" : threatLevel >= 61 ? "#ff8c00" : threatLevel >= 31 ? "#ff9d00" : "#7CFC00";

  return (
    <div
      style={{
        height: "100%",
        overflow: "hidden",
        padding: "10px 10px 80px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* 1. Welcome */}
      <div
        style={{
          padding: "8px 10px",
          border: "1px solid rgba(255,157,0,0.3)",
          background: "rgba(255,157,0,0.05)",
          borderRadius: "2px",
        }}
      >
        <div style={{ fontSize: "9px", color: "#ff9d00", letterSpacing: "0.15em", fontWeight: 700 }}>
          WELCOME
        </div>
        <div style={{ fontSize: "14px", color: "#fff", fontWeight: 700, marginTop: "2px" }}>
          {displayName}
        </div>
      </div>

      {/* 2. Hometown news bar */}
      <div
        style={{
          padding: "6px 10px",
          background: hometownBg,
          borderLeft: `3px solid ${hometownBg}`,
          color: "#050505",
          fontSize: "10px",
          fontWeight: 700,
          lineHeight: 1.4,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          borderRadius: "2px",
          whiteSpace: "pre-line",
        }}
      >
        {hometownText}
      </div>

      {/* 3. SPC bot message — interactive (expandable per-risk dropdowns) */}
      {botMsg ? (
        <SystemMessageCard
          message={
            {
              id: botMsg.id,
              user_id: BOT_USER_ID,
              username: "SPC Bot",
              badge: "System",
              content: botMsg.content,
              created_at: botMsg.created_at,
            } satisfies RawMessage
          }
          expandedKey={expandedKey}
          toggle={toggleKey}
        />
      ) : (
        <div
          style={{
            padding: "8px 10px",
            border: "1px solid rgba(255,165,0,0.3)",
            background: "rgba(255,165,0,0.08)",
            borderRadius: "2px",
            color: "#888",
            fontSize: "11px",
          }}
        >
          No SPC outlook yet.
        </div>
      )}
      {/* 4. Environmental metrics */}
      <div
        style={{
          padding: "8px 10px",
          border: "1px solid rgba(255,157,0,0.2)",
          background: "rgba(10,10,14,0.6)",
          borderRadius: "2px",
        }}
      >
        <div style={{ fontSize: "9px", color: "#ff9d00", letterSpacing: "0.15em", fontWeight: 700, marginBottom: "6px" }}>
          ENVIRONMENTAL METRICS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "4px" }}>
          {nodes.map((n) => (
            <div
              key={n.label}
              style={{
                position: "relative",
                padding: "4px 4px 4px 4px",
                background: "#050505",
                borderLeft: "2px solid rgba(255,157,0,0.3)",
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <div style={{ fontSize: "7px", color: "#888", lineHeight: 1 }}>{n.label}</div>
              <div style={{ fontSize: "11px", color: n.color, fontWeight: 700, marginTop: "2px", whiteSpace: "nowrap" }}>
                {n.value}
              </div>
              <div style={{ fontSize: "7px", color: "#666", marginTop: "1px" }}>{n.unit}</div>
              <div
                style={{
                  position: "absolute",
                  top: 1,
                  right: 1,
                  fontSize: "8px",
                  color: "#050505",
                  background: "#eaeaea",
                  fontWeight: 700,
                  padding: "0 3px",
                  borderRadius: "1px",
                }}
              >
                {n.w}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. WRS bar */}
      <div
        style={{
          padding: "8px 10px",
          border: "1px solid rgba(255,157,0,0.2)",
          background: "rgba(10,10,14,0.6)",
          borderRadius: "2px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <span style={{ fontSize: "10px", color: "#888", letterSpacing: "0.15em", fontWeight: 700 }}>WRS</span>
        <div
          style={{
            flex: 1,
            height: "8px",
            background: "rgba(255,255,255,0.08)",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${threatLevel}%`,
              height: "100%",
              background: threatColor,
              transition: "width 0.6s ease-out",
            }}
          />
        </div>
        <span style={{ fontSize: "14px", color: threatColor, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
          {threatLevel}
        </span>
      </div>
    </div>
  );
}
