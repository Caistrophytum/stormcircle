/**
 * DataProvider — the single source of truth for cross-component server state.
 *
 * Before this provider existed, every component that needed alerts, polygons,
 * the current user, LSRs, or the online-count opened its OWN supabase
 * `select` and its OWN realtime channel. With 5–6 such components on a single
 * page, that meant 5–6× queries on every realtime event and 5–6× realtime
 * channels per browser tab. The fixed 10-connection Auth DB pool would
 * saturate under load and produce 504 "context deadline exceeded" on /token
 * (visible in the auth logs), warning lists would flip back to "loading…" on
 * any transient hiccup, and WRS sounding boxes would briefly show ERR.
 *
 * This provider owns ONE of each subscription and exposes the existing hook
 * shapes via React context. The public hooks (useAlerts, useWarningPolygons,
 * useAuth, useLSR, useOnlineCount) become thin context selectors with the
 * exact same return types and import paths, so call sites don't change.
 *
 * Key correctness rules enforced here:
 *   - Realtime bursts are debounced (300 ms) so a national outbreak doesn't
 *     trigger N renders per second.
 *   - On any fetch error, we set `error` but NEVER clear previously loaded
 *     data. The UI keeps showing the last good snapshot instead of flashing
 *     empty lists or "loading…".
 *   - `loading` only flips true on the very first load; background refreshes
 *     stay quiet.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type {
  Alert,
  AlertsData,
  Severity,
  AlertKind,
  Certainty,
  Urgency,
  TopHazard,
  NewWarning,
} from "@/hooks/useAlerts";
import type {
  WarningPolygon,
  WarningPolygonsData,
} from "@/hooks/useWarningPolygons";
import { getWarningColor } from "@/hooks/useWarningPolygons";
import type { LSRReport } from "@/hooks/useLSR";
import type { Profile } from "@/hooks/useAuth";

// ---------------- shared constants ----------------

const NEW_WINDOW_MS = 5 * 60_000;
const REALTIME_DEBOUNCE_MS = 300;
const ALERTS_REFRESH_MS = 60_000;
const LSR_REFRESH_MS = 60_000;
const LSR_URL =
  "https://mesonet.agron.iastate.edu/geojson/lsr.py?hours=2&wfo=ALL";

const VALID_SEVERITIES: Severity[] = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];
const VALID_CERTAINTY: Certainty[] = ["Observed", "Likely", "Possible", "Unlikely", "Unknown"];
const VALID_URGENCY: Urgency[] = ["Immediate", "Expected", "Future", "Past", "Unknown"];

const SEVERITY_ORDER: Record<Severity, number> = {
  Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4,
};
const KIND_ORDER: Record<AlertKind, number> = {
  Emergency: 0, Warning: 1, Watch: 2, Advisory: 3, Statement: 4, Other: 5,
};
const CERTAINTY_ORDER: Record<Certainty, number> = {
  Observed: 0, Likely: 1, Possible: 2, Unlikely: 3, Unknown: 4,
};
const URGENCY_ORDER: Record<Urgency, number> = {
  Immediate: 0, Expected: 1, Future: 2, Past: 3, Unknown: 4,
};

function normalizeSeverity(s: unknown): Severity {
  return VALID_SEVERITIES.includes(s as Severity) ? (s as Severity) : "Unknown";
}
function normalizeCertainty(s: unknown): Certainty {
  return VALID_CERTAINTY.includes(s as Certainty) ? (s as Certainty) : "Unknown";
}
function normalizeUrgency(s: unknown): Urgency {
  return VALID_URGENCY.includes(s as Urgency) ? (s as Urgency) : "Unknown";
}

function deriveKind(event: string): AlertKind {
  const e = event.toLowerCase();
  if (e.includes("emergency")) return "Emergency";
  if (e.includes("warning")) return "Warning";
  if (e.includes("watch")) return "Watch";
  if (e.includes("advisory")) return "Advisory";
  if (e.includes("statement")) return "Statement";
  return "Other";
}

function extractTags(props: Record<string, any>): string[] {
  const tags: string[] = [];
  const haystack = [
    props.headline,
    props.description,
    props.event,
    props.parameters?.tornadoDamageThreatTag,
    props.parameters?.thunderstormDamageThreatTag,
    props.parameters?.flashFloodDamageThreatTag,
    props.parameters?.spcWatchTitle,
    props.parameters?.spcPds,
    Array.isArray(props.parameters?.NWSheadline)
      ? props.parameters.NWSheadline.join(" ")
      : props.parameters?.NWSheadline,
  ].filter(Boolean).map((v: any) => String(v).toLowerCase()).join(" ");

  if (/particularly dangerous situation|\bpds\b/.test(haystack)) tags.push("PDS");
  if (/tornado emergency/.test(haystack)) tags.push("Tornado Emergency");
  if (/flash flood emergency/.test(haystack)) tags.push("Flash Flood Emergency");
  if (/\bdestructive\b/.test(haystack)) tags.push("Destructive");
  if (/\bconsiderable\b/.test(haystack)) tags.push("Considerable");
  if (/\bcatastrophic\b/.test(haystack)) tags.push("Catastrophic");

  return Array.from(new Set(tags));
}

function dangerScore(a: Alert): number {
  let tagTier = 4;
  if (a.tags.includes("Tornado Emergency") || a.tags.includes("Flash Flood Emergency")) tagTier = 0;
  else if (a.tags.includes("PDS") || a.tags.includes("Catastrophic")) tagTier = 1;
  else if (a.tags.includes("Destructive")) tagTier = 2;
  else if (a.tags.includes("Considerable")) tagTier = 3;

  const isExtreme = a.severity === "Extreme" ? 0 : 1;
  return (
    KIND_ORDER[a.kind] * 10_000_000 +
    isExtreme * 1_000_000 +
    tagTier * 100_000 +
    SEVERITY_ORDER[a.severity] * 1_000 +
    CERTAINTY_ORDER[a.certainty] * 10 +
    URGENCY_ORDER[a.urgency]
  );
}

// ---------------- zone-geometry fallback (rarely used now) ----------------
//
// The alerts-poll edge function now resolves zone geometries server-side and
// stores them directly in active_alerts.geometry, so this client path is the
// SAFETY NET for the small window between when an alert first appears and
// when the next poll fills its shape. Cached in localStorage so it almost
// never re-hits the network.

type ZoneGeom = GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
const zoneGeomCache = new Map<string, ZoneGeom | Promise<ZoneGeom>>();
const LS_KEY = "nws-zone-geom-v1";

try {
  if (typeof window !== "undefined" && window.localStorage) {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const entries: [string, ZoneGeom][] = JSON.parse(raw);
      for (const [k, v] of entries) zoneGeomCache.set(k, v);
    }
  }
} catch { /* ignore */ }

let lsFlushScheduled = false;
function scheduleLsFlush() {
  if (lsFlushScheduled || typeof window === "undefined") return;
  lsFlushScheduled = true;
  const flush = () => {
    lsFlushScheduled = false;
    try {
      const out: [string, ZoneGeom][] = [];
      for (const [k, v] of zoneGeomCache) {
        if (v && !(v instanceof Promise)) out.push([k, v]);
      }
      window.localStorage.setItem(LS_KEY, JSON.stringify(out));
    } catch { /* ignore */ }
  };
  if ((window as any).requestIdleCallback) {
    (window as any).requestIdleCallback(flush, { timeout: 2000 });
  } else {
    setTimeout(flush, 1000);
  }
}

async function fetchZoneGeometry(zoneUrl: string): Promise<ZoneGeom> {
  const cached = zoneGeomCache.get(zoneUrl);
  if (cached !== undefined) return cached as ZoneGeom | Promise<ZoneGeom>;

  const promise = (async (): Promise<ZoneGeom> => {
    try {
      const res = await fetch(zoneUrl, {
        headers: { "User-Agent": "StormCircle/1.0", Accept: "application/geo+json" },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const geom = json?.geometry;
      if (geom?.type === "Polygon" || geom?.type === "MultiPolygon") {
        zoneGeomCache.set(zoneUrl, geom);
        scheduleLsFlush();
        return geom as ZoneGeom;
      }
      return null;
    } catch {
      return null;
    }
  })();

  zoneGeomCache.set(zoneUrl, promise);
  const resolved = await promise;
  zoneGeomCache.set(zoneUrl, resolved);
  if (resolved) scheduleLsFlush();
  return resolved;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function resolveZonesGeometry(
  zoneUrls: string[],
): Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon | null> {
  const geoms = await runWithConcurrency(zoneUrls, 8, (u) => fetchZoneGeometry(u));
  const polys: number[][][][] = [];
  for (const g of geoms) {
    if (!g) continue;
    if (g.type === "Polygon") polys.push(g.coordinates as number[][][]);
    else polys.push(...(g.coordinates as number[][][][]));
  }
  if (polys.length === 0) return null;
  if (polys.length === 1) return { type: "Polygon", coordinates: polys[0] };
  return { type: "MultiPolygon", coordinates: polys };
}

// ---------------- row → derived data ----------------

interface AlertRow {
  alert_id: string;
  event: string | null;
  severity: string | null;
  certainty: string | null;
  urgency: string | null;
  headline: string | null;
  area_desc: string | null;
  expires_at: string | null;
  first_seen_at: string | null;
  geometry: any;
  properties: any;
}

function rowToAlert(r: AlertRow): Alert {
  const event = r.event ?? "Unknown";
  const params = r.properties?.parameters ?? {};
  return {
    event,
    severity: normalizeSeverity(r.severity),
    headline: r.headline ?? "",
    areaDesc: r.area_desc ?? "",
    kind: deriveKind(event),
    certainty: normalizeCertainty(r.certainty),
    urgency: normalizeUrgency(r.urgency),
    tags: extractTags({
      headline: r.headline,
      description: r.properties?.description,
      event,
      parameters: params,
    }),
  };
}

function rowToPolygonProps(r: AlertRow) {
  return {
    id: r.alert_id,
    event: r.event,
    areaDesc: r.area_desc,
    expires: r.expires_at,
    description: r.properties?.description ?? "",
    headline: r.headline,
    severity: r.severity,
    certainty: r.certainty,
    urgency: r.urgency,
    parameters: r.properties?.parameters ?? {},
  };
}

function makePolygon(
  r: AlertRow,
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): WarningPolygon {
  const props = rowToPolygonProps(r);
  return {
    id: String(props.id),
    event: String(props.event),
    areaDesc: String(props.areaDesc ?? ""),
    expires: String(props.expires ?? ""),
    description: String(props.description ?? ""),
    headline: String(props.headline ?? ""),
    severity: String(props.severity ?? ""),
    certainty: String(props.certainty ?? ""),
    urgency: String(props.urgency ?? ""),
    parameters: props.parameters,
    color: getWarningColor(props),
    geometry,
  };
}

// ---------------- context shape ----------------

interface DataContextValue {
  alerts: AlertsData;
  polygons: WarningPolygonsData;
  auth: {
    user: User | null;
    profile: Profile | null;
    loading: boolean;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
  };
  lsr: {
    reports: LSRReport[];
    loading: boolean;
    error: string | null;
    lastUpdated: Date | null;
  };
  onlineCount: number;
}

const EMPTY_ALERTS: AlertsData = {
  mostDangerous: [], topHazards: [], newWarnings: [], recentAlerts: [],
  loading: true, error: null, lastUpdated: null,
};
const EMPTY_POLYS: WarningPolygonsData = {
  polygons: [], loading: true, error: null, lastUpdated: null,
};
const EMPTY_LSR = { reports: [] as LSRReport[], loading: true, error: null as string | null, lastUpdated: null as Date | null };

const DataContext = createContext<DataContextValue | null>(null);

// ---------------- provider ----------------

export function DataProvider({ children }: { children: ReactNode }) {
  // ===== alerts + polygons (one subscription, two derived shapes) =====
  const [alerts, setAlerts] = useState<AlertsData>(EMPTY_ALERTS);
  const [polygons, setPolygons] = useState<WarningPolygonsData>(EMPTY_POLYS);

  // ===== auth =====
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ===== LSR =====
  const [lsr, setLsr] = useState(EMPTY_LSR);

  // ===== online presence =====
  const [onlineCount, setOnlineCount] = useState(1);

  // -------- alerts/polygons loader --------
  const loadAlertsRef = useRef<() => void>(() => {});
  const polyVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const { data: rows, error } = await supabase
          .from("active_alerts")
          .select("alert_id, event, severity, certainty, urgency, headline, area_desc, expires_at, first_seen_at, geometry, properties");
        if (error) throw error;
        if (cancelled) return;

        const rowsArr = (rows ?? []) as AlertRow[];

        // --- alerts derivation ---
        const cutoff = Date.now() - NEW_WINDOW_MS;
        const list: Alert[] = [];
        const newCounts = new Map<string, number>();
        const recent: { ts: number; alert: Alert }[] = [];

        for (const r of rowsArr) {
          const a = rowToAlert(r);
          list.push(a);
          const ts = r.first_seen_at ? new Date(r.first_seen_at).getTime() : 0;
          if (ts >= cutoff && (a.kind === "Warning" || a.kind === "Emergency" || a.kind === "Watch")) {
            newCounts.set(a.event, (newCounts.get(a.event) ?? 0) + 1);
            recent.push({ ts, alert: a });
          }
        }

        const mostDangerous = [...list].sort((a, b) => dangerScore(a) - dangerScore(b)).slice(0, 10);
        const counts = new Map<string, number>();
        for (const a of list) counts.set(a.event, (counts.get(a.event) ?? 0) + 1);
        const topHazards: TopHazard[] = Array.from(counts.entries())
          .map(([event, count]) => ({ event, count }))
          .sort((a, b) => b.count - a.count).slice(0, 10);
        const newWarnings: NewWarning[] = Array.from(newCounts.entries())
          .map(([event, count]) => ({ event, count }))
          .sort((a, b) => b.count - a.count).slice(0, 5);
        const recentAlerts = recent.sort((a, b) => b.ts - a.ts).map((e) => e.alert).slice(0, 10);

        setAlerts({
          mostDangerous, topHazards, newWarnings, recentAlerts,
          loading: false, error: null, lastUpdated: new Date(),
        });

        // --- polygons derivation ---
        const inline: WarningPolygon[] = [];
        const fallbackJobs: { r: AlertRow; promise: Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon | null> }[] = [];
        for (const r of rowsArr) {
          if (r.geometry) {
            inline.push(makePolygon(r, r.geometry as any));
            continue;
          }
          // Server hasn't filled geometry yet — fall back to client-side
          // zone resolution (cached) so the user still sees the polygon.
          const zones: string[] = r.properties?.affectedZones ?? [];
          if (zones.length > 0) {
            fallbackJobs.push({ r, promise: resolveZonesGeometry(zones) });
          } else {
            const alertUrl: string | undefined = r.properties?.["@id"] ?? r.properties?.id;
            if (typeof alertUrl === "string" && alertUrl.startsWith("http")) {
              fallbackJobs.push({ r, promise: fetchZoneGeometry(alertUrl) });
            }
          }
        }

        const version = ++polyVersionRef.current;
        setPolygons({
          polygons: inline,
          loading: fallbackJobs.length > 0,
          error: null,
          lastUpdated: new Date(),
        });
        if (fallbackJobs.length === 0) return;

        const streamed: WarningPolygon[] = [];
        let pending = fallbackJobs.length;
        let rafQueued = false;
        const flush = () => {
          rafQueued = false;
          if (cancelled || polyVersionRef.current !== version) return;
          setPolygons({
            polygons: [...inline, ...streamed],
            loading: pending > 0,
            error: null,
            lastUpdated: new Date(),
          });
        };
        for (const { r, promise } of fallbackJobs) {
          promise.then((g) => {
            pending -= 1;
            if (g) streamed.push(makePolygon(r, g));
            if (!rafQueued) {
              rafQueued = true;
              (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : (cb: any) => setTimeout(cb, 16))(flush);
            }
          });
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load alerts";
        // KEEP-LAST-GOOD: only set error, never wipe data or flip loading
        // back to true after first success.
        setAlerts((p) => ({ ...p, loading: false, error: msg }));
        setPolygons((p) => ({ ...p, loading: false, error: msg }));
      }
    }
    loadAlertsRef.current = load;

    const scheduleLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void load(); }, REALTIME_DEBOUNCE_MS);
    };

    // Initial load, deferred slightly so radar/basemap tiles get first slot.
    const ric: (cb: () => void) => number =
      (window as any).requestIdleCallback
        ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 1500 })
        : (cb) => window.setTimeout(cb, 200);
    const cic: (id: number) => void =
      (window as any).cancelIdleCallback
        ? (id) => (window as any).cancelIdleCallback(id)
        : (id) => window.clearTimeout(id);
    const idleId = ric(() => { void load(); });

    const channelName = `data_provider_alerts_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "active_alerts" },
        scheduleLoad)
      .subscribe();

    const interval = setInterval(() => { void load(); }, ALERTS_REFRESH_MS);

    return () => {
      cancelled = true;
      cic(idleId);
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, []);

  // -------- auth --------
  useEffect(() => {
    let mounted = true;

    async function fetchProfile(userId: string) {
      try {
        const { data, error } = await supabase
          .from("profiles").select("*").eq("id", userId).maybeSingle();
        if (!mounted) return;
        if (error) {
          console.error("Failed to load profile:", error);
          // Keep previous profile rather than wiping on transient failures.
          return;
        }
        setProfile(data as Profile | null);
      } catch (err) {
        console.error("Failed to load profile:", err);
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const next = session?.user ?? null;
      setUser(next);
      if (next) {
        // Deferred to avoid the Supabase deadlock when calling supabase from
        // inside an auth event callback.
        setTimeout(() => { if (mounted) void fetchProfile(next.id); }, 0);
      } else {
        setProfile(null);
      }
    });

    // Robust session bootstrap. Resolve `authLoading` AS SOON AS we know
    // whether a user exists — the profile row arrives in the background so
    // the StatusBar / role-gated UI stops blocking on a separate round-trip.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        const existing = session?.user ?? null;
        setUser(existing);
        setAuthLoading(false);
        if (existing) {
          void fetchProfile(existing.id);
        }
      })
      .catch((err) => {
        console.warn("getSession failed, treating as signed out:", err);
        if (mounted) {
          setUser(null);
          setProfile(null);
          setAuthLoading(false);
        }
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useMemo(() => async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useMemo(() => async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) {
      console.error("Failed to refresh profile:", error);
      return;
    }
    setProfile(data as Profile | null);
  }, [user]);

  // -------- LSR --------
  useEffect(() => {
    let cancelled = false;

    const fetchReports = async () => {
      try {
        const res = await fetch(LSR_URL);
        if (!res.ok) throw new Error(`LSR fetch failed: ${res.status}`);
        const data = await res.json();
        const features: any[] = Array.isArray(data?.features) ? data.features : [];
        const parsed: LSRReport[] = features
          .map((f) => {
            const p = f?.properties ?? {};
            const coords = f?.geometry?.coordinates;
            const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
            const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
            const magRaw = p.magnitude;
            const magnitude =
              magRaw === null || magRaw === undefined || magRaw === ""
                ? null
                : Number.isFinite(Number(magRaw)) ? Number(magRaw) : null;
            return {
              valid: String(p.valid ?? ""),
              typetext: String(p.typetext ?? ""),
              city: String(p.city ?? ""),
              county: String(p.county ?? ""),
              state: String(p.state ?? ""),
              source: String(p.source ?? ""),
              remark: String(p.remark ?? ""),
              magnitude, wfo: String(p.wfo ?? ""), lat, lon,
            } as LSRReport;
          })
          .filter((r): r is LSRReport => r !== null)
          .sort((a, b) => (a.valid < b.valid ? 1 : -1));
        if (cancelled) return;
        setLsr({ reports: parsed, loading: false, error: null, lastUpdated: new Date() });
      } catch (err) {
        if (cancelled) return;
        // KEEP-LAST-GOOD
        setLsr((p) => ({ ...p, loading: false, error: err instanceof Error ? err.message : "Failed to fetch LSRs" }));
      }
    };

    // Defer the first LSR fetch until the browser is idle — keeps it out
    // of the critical path so basemap / alerts get the first network slots.
    const ric: (cb: () => void) => number =
      (window as any).requestIdleCallback
        ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 2000 })
        : (cb) => window.setTimeout(cb, 500);
    const idleId = ric(() => { void fetchReports(); });
    const id = setInterval(fetchReports, LSR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      if ((window as any).cancelIdleCallback) (window as any).cancelIdleCallback(idleId);
      else clearTimeout(idleId);
    };
  }, []);

  // -------- online count (deferred until idle) --------
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const start = () => {
      channel = supabase.channel("online-users", {
        config: { presence: { key: crypto.randomUUID() } },
      });
      const update = () => {
        if (!channel) return;
        const state = channel.presenceState();
        setOnlineCount(Object.keys(state).length);
      };
      channel
        .on("presence", { event: "sync" }, update)
        .on("presence", { event: "join" }, update)
        .on("presence", { event: "leave" }, update)
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && channel) {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });
    };
    const ric: (cb: () => void) => number =
      (window as any).requestIdleCallback
        ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 3000 })
        : (cb) => window.setTimeout(cb, 1000);
    const idleId = ric(start);
    return () => {
      if ((window as any).cancelIdleCallback) (window as any).cancelIdleCallback(idleId);
      else clearTimeout(idleId);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const value = useMemo<DataContextValue>(() => ({
    alerts, polygons,
    auth: { user, profile, loading: authLoading, signOut, refreshProfile },
    lsr, onlineCount,
  }), [alerts, polygons, user, profile, authLoading, signOut, refreshProfile, lsr, onlineCount]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// ---------------- internal context accessor ----------------

export function useDataContext(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error("Data hooks must be used inside <DataProvider>");
  }
  return ctx;
}
