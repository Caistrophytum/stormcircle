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
import CurrentLocationHazards from "@/components/CurrentLocationHazards";
import type { RawMessage } from "@/lib/reportGrouping";

const BOT_USER_ID = "00000000-0000-0000-0000-000000000000";
const HURRICANE_BOT_ID = "00000000-0000-0000-0000-000000000001";
const FIRE_BOT_ID = "00000000-0000-0000-0000-000000000002";
const BOT_USER_IDS = [BOT_USER_ID, HURRICANE_BOT_ID, FIRE_BOT_ID];

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
  const text = `${p.description} ${p.headline} ${p.parameters?.spcWatchTitle ?? ""} ${p.parameters?.spcPds ?? ""}`.toLowerCase();
  const pds = /particularly dangerous situation|\bpds\b/.test(text);

  // Warnings (active hazard)
  if (ev === "Tornado Warning") {
    if (text.includes("tornado emergency")) return 10;
    if (pds) return 9;
    return 8;
  }
  if (ev === "Flash Flood Warning") {
    if (text.includes("flash flood emergency")) return 7;
    return 3;
  }
  if (ev === "Severe Thunderstorm Warning") return pds ? 6 : 4;
  if (ev.endsWith("Warning")) return 2;

  // Watches (conditions favorable) — always rank below the matching Warning,
  // but PDS Watches outrank generic Warnings since SPC reserves them for
  // exceptionally dangerous setups.
  if (ev === "Tornado Watch") return pds ? 5 : 1;
  if (ev === "Severe Thunderstorm Watch") return pds ? 5 : 1;
  if (ev === "Flash Flood Watch") return 1;

  return null;
}


// Point-in-ring (ray casting) in lon/lat space — fine for short-range warnings.
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Approximate great-circle distance from a point to a segment by projecting
// into a local equirectangular plane (km). Accurate to <1% for segments
// shorter than a few hundred km — well within warning polygon scale.
function pointToSegmentKm(
  origin: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos((origin.lat * Math.PI) / 180);
  const ox = 0;
  const oy = 0;
  const ax = (a.lon - origin.lon) * kmPerDegLon;
  const ay = (a.lat - origin.lat) * kmPerDegLat;
  const bx = (b.lon - origin.lon) * kmPerDegLon;
  const by = (b.lat - origin.lat) * kmPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((ox - ax) * dx + (oy - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx;
  const py = ay + t * dy;
  return Math.hypot(px, py);
}

function nearestPolygonKm(
  origin: { lat: number; lon: number },
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number {
  const polys: number[][][][] =
    geom.type === "Polygon" ? [geom.coordinates as number[][][]] : (geom.coordinates as number[][][][]);
  let best = Infinity;
  for (const poly of polys) {
    if (!poly.length) continue;
    const outer = poly[0];
    // Inside the outer ring (and not in any hole) → 0 km away.
    if (pointInRing(origin.lon, origin.lat, outer)) {
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(origin.lon, origin.lat, poly[h])) { inHole = true; break; }
      }
      if (!inHole) return 0;
    }
    // Otherwise: min distance to any edge of any ring.
    for (let r = 0; r < poly.length; r++) {
      const ring = poly[r];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [alon, alat] = ring[j];
        const [blon, blat] = ring[i];
        const d = pointToSegmentKm(origin, { lat: alat, lon: alon }, { lat: blat, lon: blon });
        if (d < best) best = d;
      }
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
      .channel(`mobile-spc-bot_${Math.random().toString(36).slice(2)}_${Date.now()}`)
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

interface HurricaneBotMessage {
  id: string;
  content: string;
  created_at: string;
}

/**
 * Subscribe to the most recent Hurricane Bot message (any of: season
 * status, advisory update, danger card). Mirrors `useSPCBotMessage` but
 * filters on the Hurricane Bot UUID and uses a distinct realtime channel
 * so the two bot streams don't collide.
 */
function useHurricaneBotMessage() {
  const [msg, setMsg] = useState<HurricaneBotMessage | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id,content,created_at")
        .eq("user_id", HURRICANE_BOT_ID)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setMsg((data as HurricaneBotMessage | null) ?? null);
    };
    void load();
    const ch = supabase
      .channel(`mobile-hurricane-bot_${Math.random().toString(36).slice(2)}_${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${HURRICANE_BOT_ID}` },
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

function useFireBotMessage() {
  const [msg, setMsg] = useState<{ id: string; content: string; created_at: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id,content,created_at")
        .eq("user_id", FIRE_BOT_ID)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setMsg(data ?? null);
    };
    void load();
    const ch = supabase
      .channel(`mobile-fire-bot_${Math.random().toString(36).slice(2)}_${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${FIRE_BOT_ID}` },
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
        .order("created_at", { ascending: false })
        .limit(limit * 2);
      if (!cancelled && data) {
        const filtered = (data as ChatMessage[]).filter((m) => !BOT_USER_IDS.includes(m.user_id)).slice(0, limit);
        setMsgs(filtered);
      }
    };
    void load();
    const ch = supabase
      .channel(`mobile-main-chat_${Math.random().toString(36).slice(2)}_${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => void load())
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
  const hurricaneMsg = useHurricaneBotMessage();
  const fireMsg = useFireBotMessage();
  const chatMsgs = useRecentChatMessages(30);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [chatMsgs.length]);
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
    // LIFTED INDEX is a dimensionless stability index, never unit-converted.
    const fmtLI = (v: number | null, digits = 1) => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      return v.toFixed(digits);
    };
    const fmtLenM = (v: number | null) => {
      if (sounding.loading) return "...";
      if (radar.selectedStation === null) return "—";
      if (v === null) return "ERR";
      const d = displayLengthM(v, unitSystem);
      return d ? Math.round(d.value).toLocaleString() : "ERR";
    };
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

    // Unified color scale tied to each parameter's normalized severity score.
    // The redder the value, the more it pushes the WRS score upward.
    const colorFromScore = (score: number, hasValue: boolean): string => {
      if (!stationActive || !hasValue) return "#7CFC00";
      if (score >= 0.75) return "#ff3b3b";
      if (score >= 0.5) return "#ff8c00";
      if (score >= 0.25) return "#ffd700";
      return "#7CFC00";
    };

    const nodes = [
      { label: "CAPE", value: fmt(sounding.cape), unit: "J/kg", color: colorFromScore(capeScore, sounding.cape != null), w: capeContrib },
      { label: "CIN", value: fmt(sounding.cin), unit: "J/kg", color: colorFromScore(cinScore, sounding.cin != null), w: cinContrib },
      { label: "LI", value: fmtTemp(sounding.li, 1), unit: tempUnit, color: colorFromScore(liScore, sounding.li != null), w: liContrib },
      { label: "BLH", value: fmtLenM(sounding.blh), unit: lenUnit, color: colorFromScore(blhScore, sounding.blh != null), w: blhContrib },
      { label: "LCL", value: fmtLenM(sounding.lcl), unit: lenUnit, color: colorFromScore(lclScore, sounding.lcl != null), w: lclContrib },
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
      const d = nearestPolygonKm(coords, p.geometry);
      if (r > bestRank || d < bestDist) {
        bestRank = r;
        bestDist = d;
        const text = `${p.description} ${p.headline} ${p.parameters?.spcWatchTitle ?? ""} ${p.parameters?.spcPds ?? ""}`.toLowerCase();
        if (p.event === "Tornado Warning" && text.includes("tornado emergency")) bestEvent = "Tornado Emergency";
        else if (p.event === "Flash Flood Warning" && text.includes("flash flood emergency"))
          bestEvent = "Flash Flood Emergency";
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
      if (km <= 0.05) {
        hometownText += `\n\nYou are inside an active ${nearestDanger.event} polygon.`;
      } else {
        const useMiles = unitSystem === "imperial";
        const val = useMiles ? km * 0.621371 : km;
        const unit = useMiles ? "mi" : "km";
        const formatted = val < 10 ? val.toFixed(1) : Math.round(val).toLocaleString();
        hometownText += `\n\nNearest ${nearestDanger.event}: ${formatted} ${unit} away (edge-to-home).`;
      }
    }
  }

  // SPC bot rendering is delegated to SystemMessageCard (handles markers, payload, dropdowns).

  const threatColor =
    threatLevel > 85 ? "#ff3b3b" : threatLevel >= 61 ? "#ff8c00" : threatLevel >= 31 ? "#ff9d00" : "#7CFC00";

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "10px 10px 80px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* Visually-hidden H1 — gives the mobile homepage a proper document
          outline for search engines and screen readers without altering the
          existing visual design. */}
      <h1
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        StormCircle — Real-time Meteorological Network
      </h1>

      {/* 1. Welcome */}
      <div
        style={{
          padding: "8px 10px",
          border: "1px solid rgba(255,157,0,0.3)",
          background: "rgba(255,157,0,0.05)",
          borderRadius: "2px",
        }}
      >
        <h2 style={{ fontSize: "9px", color: "#ff9d00", letterSpacing: "0.15em", fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>WELCOME</h2>
        <div style={{ fontSize: "14px", color: "#fff", fontWeight: 700, marginTop: "2px" }}>{displayName}</div>
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

      {/* 2b. Current-location hazards — transparent, outlined per polygon color. */}
      <CurrentLocationHazards
        polygons={warningPolygons.polygons}
        coords={homeRisk.coords}
        cityLabel={profile?.location ?? null}
      />



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

      {/* 3b. Fire Weather bot message (between SPC and Hurricane) */}
      {fireMsg && (
        <SystemMessageCard
          message={
            {
              id: fireMsg.id,
              user_id: FIRE_BOT_ID,
              username: "Fire Weather Bot",
              badge: "System",
              content: fireMsg.content,
              created_at: fireMsg.created_at,
            } satisfies RawMessage
          }
          expandedKey={expandedKey}
          toggle={toggleKey}
        />
      )}

      {/* 3c. Hurricane bot message (when present) */}
      {hurricaneMsg && (
        <SystemMessageCard
          message={
            {
              id: hurricaneMsg.id,
              user_id: HURRICANE_BOT_ID,
              username: "Hurricane Bot",
              badge: "System",
              content: hurricaneMsg.content,
              created_at: hurricaneMsg.created_at,
            } satisfies RawMessage
          }
          expandedKey={expandedKey}
          toggle={toggleKey}
        />
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
        <h2
          style={{ fontSize: "9px", color: "#ff9d00", letterSpacing: "0.15em", fontWeight: 700, marginBottom: "6px", margin: "0 0 6px 0", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}
        >
          ENVIRONMENTAL METRICS
        </h2>
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
              <div
                style={{ fontSize: "11px", color: n.color, fontWeight: 700, marginTop: "2px", whiteSpace: "nowrap" }}
              >
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
        <h2 style={{ fontSize: "10px", color: "#888", letterSpacing: "0.15em", fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>WRS</h2>
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
        <span
          style={{ fontSize: "14px", color: threatColor, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}
        >
          {threatLevel}
        </span>
      </div>

      {/* 6. Latest chat messages — fills remaining space up to floating buttons */}
      <div
        style={{
          flex: "1 0 150px",
          minHeight: "150px",
          display: "flex",
          flexDirection: "column",
          border: "1px solid rgba(255,157,0,0.2)",
          background: "rgba(10,10,14,0.6)",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        <h2
          style={{
            fontSize: "9px",
            color: "#ff9d00",
            letterSpacing: "0.15em",
            fontWeight: 700,
            padding: "6px 10px",
            borderBottom: "1px solid rgba(255,157,0,0.15)",
            flexShrink: 0,
            margin: 0,
            fontFamily: "'JetBrains Mono', monospace",
            textTransform: "uppercase",
          }}
        >
          LATEST CHAT
        </h2>
        <div
          ref={chatScrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "6px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,157,0,0.3) transparent",
          }}
        >
          {chatMsgs.length === 0 && <div style={{ color: "#666", fontSize: "10px" }}>No messages yet.</div>}
          {chatMsgs.map((m) => {
            const badgeColor = m.badge === "Meteorologist" ? "#ff9d00" : m.badge === "System" ? "#ffa500" : "#7dd3fc";
            const time = new Date(m.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <div
                key={m.id}
                style={{
                  padding: "4px 6px",
                  background: "rgba(255,255,255,0.03)",
                  borderLeft: `2px solid ${badgeColor}`,
                  borderRadius: "2px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "6px", marginBottom: "2px" }}>
                  <span
                    style={{
                      color: badgeColor,
                      fontSize: "9px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {m.username}
                  </span>
                  <span style={{ color: "#666", fontSize: "9px" }}>{time}</span>
                </div>
                <div style={{ color: "#ddd", fontSize: "10px", lineHeight: 1.4, wordBreak: "break-word" }}>
                  {m.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
