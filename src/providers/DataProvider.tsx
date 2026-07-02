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
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
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
import { IEM_LSR_URL as LSR_URL } from "@/lib/endpoints";

// ---------------- shared constants ----------------

const NEW_WINDOW_MS = 5 * 60_000;
const REALTIME_DEBOUNCE_MS = 300;
const ALERTS_REFRESH_MS = 60_000;
const LSR_REFRESH_MS = 60_000;
const PROFILE_TIMEOUT_MS = 5_000;
const ALERTS_TIMEOUT_MS = 8_000;
const POLYGONS_TIMEOUT_MS = 10_000;

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
  // NWS evacuation/shelter products carry life-safety urgency equivalent to
  // a civil emergency even though the event name doesn't contain the word
  // "emergency" — classify them as Emergency so they surface at the top of
  // hazard lists and pick up the emergency styling/tag.
  if (e.includes("emergency")) return "Emergency";
  if (e.includes("evacuation")) return "Emergency";
  if (e.includes("shelter in place")) return "Emergency";
  if (e.includes("warning")) return "Warning";
  if (e.includes("watch")) return "Watch";
  if (e.includes("advisory")) return "Advisory";
  if (e.includes("statement")) return "Statement";
  return "Other";
}

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: unknown }).name;
  const message = (err as { message?: unknown }).message;
  const details = (err as { details?: unknown }).details;
  return (
    name === "AbortError" ||
    String(message ?? "").toLowerCase().includes("abort") ||
    String(details ?? "").toLowerCase().includes("abort")
  );
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
const zoneGeomTs = new Map<string, number>();
const LS_KEY = "nws-zone-geom-v1";
const LS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LS_MAX_BYTES = 200_000;
const LS_MAX_ENTRIES = 100;

// Stored format: [key, geom, timestamp]. Legacy [key, geom] entries are
// treated as just-fetched on load so we don't drop the warm cache on upgrade.
type LsEntry = [string, ZoneGeom, number] | [string, ZoneGeom];

try {
  if (typeof window !== "undefined" && window.localStorage) {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const entries: LsEntry[] = JSON.parse(raw);
      const cutoff = Date.now() - LS_TTL_MS;
      for (const e of entries) {
        const [k, v, ts] = e as [string, ZoneGeom, number?];
        const stamp = typeof ts === "number" ? ts : Date.now();
        if (stamp < cutoff) continue; // drop stale
        zoneGeomCache.set(k, v);
        zoneGeomTs.set(k, stamp);
      }
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
      // Collect resolved entries with their timestamps, sort by ts ASC so
      // we can keep the most-recently-cached at the tail.
      const all: [string, ZoneGeom, number][] = [];
      for (const [k, v] of zoneGeomCache) {
        if (v && !(v instanceof Promise)) {
          all.push([k, v, zoneGeomTs.get(k) ?? 0]);
        }
      }
      all.sort((a, b) => a[2] - b[2]);
      let out = all.length > LS_MAX_ENTRIES ? all.slice(-LS_MAX_ENTRIES) : all;
      let serialized = JSON.stringify(out);
      // Trim further if still over byte budget.
      while (serialized.length > LS_MAX_BYTES && out.length > 1) {
        out = out.slice(Math.ceil(out.length / 2));
        serialized = JSON.stringify(out);
      }
      window.localStorage.setItem(LS_KEY, serialized);
    } catch { /* ignore — quota or parse error */ }
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
      const res = await fetchWithTimeout(zoneUrl, {
        headers: { "User-Agent": "StormCircle/1.0", Accept: "application/geo+json" },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const geom = json?.geometry;
      if (geom?.type === "Polygon" || geom?.type === "MultiPolygon") {
        zoneGeomCache.set(zoneUrl, geom);
        zoneGeomTs.set(zoneUrl, Date.now());
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
  if (resolved) {
    zoneGeomTs.set(zoneUrl, Date.now());
    scheduleLsFlush();
  }
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
    profileLoading: boolean;
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
  /**
   * True once the first alerts load has completed (success or error).
   * Watched by the watchdog below — if this never flips within 15 s of
   * mount or a recovery attempt, the provider force-re-initializes.
   */
  appReady: boolean;
  /**
   * Increments every time the watchdog triggers a recovery. UI can use
   * this to surface a visible "recovering…" hint if it lingers.
   */
  recoveryAttempt: number;
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
  const [profileLoading, setProfileLoading] = useState(true);


  // ===== LSR =====
  const [lsr, setLsr] = useState(EMPTY_LSR);

  // ===== online presence =====
  const [onlineCount, setOnlineCount] = useState(1);

  // ===== global watchdog =====
  //
  // The absolute worst-case stuck state should be 15 s, not "forever until
  // the user reloads". `appReady` flips true when the very first alerts
  // load resolves (success OR error — KEEP-LAST-GOOD still counts as ready
  // for the boot purpose). If it never flips, the watchdog increments
  // `recoveryAttempt`, which releases every in-flight guard, reconnects
  // realtime, and re-fires the loaders.
  const [appReady, setAppReady] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lsrFetchRef = useRef<() => void>(() => {});

  // -------- alerts/polygons loader --------
  //
  // Split into TWO queries to avoid the single ~3s+ request that used to
  // block the whole page. `active_alerts.geometry` alone averages ~24KB/row
  // across ~400 rows; pulling it on every render of the StatusBar / alerts
  // lists made even Account Center wait minutes after the tab had been
  // open a while.
  //
  // Order on each load cycle:
  //   1. lightweight summary (NO geometry) — drives alert lists everywhere
  //   2. geometry-only fetch — drives the map polygons, slightly staggered
  //
  // Route-aware: when the user is on /account, the polygon fetch is
  // skipped entirely (Account Center never renders the map).
  const loadAlertsRef = useRef<() => void>(() => {});
  const polyVersionRef = useRef(0);
  const lastRowsRef = useRef<AlertRow[]>([]);
  const alertsFetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let polyTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadSummary() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ALERTS_TIMEOUT_MS);
      try {
        const { data: rows, error } = await supabase
          .from("active_alerts")
          .select("alert_id, event, severity, certainty, urgency, headline, area_desc, expires_at, first_seen_at, properties")
          .abortSignal(controller.signal);
        if (error) throw error;
        if (cancelled) return;

        const rowsArr = ((rows ?? []) as Omit<AlertRow, "geometry">[]).map(
          (r) => ({ ...r, geometry: null }) as AlertRow,
        );
        lastRowsRef.current = rowsArr;

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
      } catch (err) {
        if (cancelled) return;
        const msg = isAbortError(err) ? "Alert feed timed out" : err instanceof Error ? err.message : "Failed to load alerts";
        // KEEP-LAST-GOOD: only set error, never wipe data.
        setAlerts((p) => ({ ...p, loading: false, error: msg }));
      } finally {
        clearTimeout(timer);
      }
    }

    async function loadPolygons() {
      // Route-aware: Account Center never needs polygons. Skip the heavy
      // geometry query so opening /account is as light as possible.
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/account")) {
        setPolygons((p) => ({ ...p, loading: false }));
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), POLYGONS_TIMEOUT_MS);
      try {
        const { data: geoRows, error } = await supabase
          .from("active_alerts")
          .select("alert_id, geometry")
          .abortSignal(controller.signal);
        if (error) throw error;
        if (cancelled) return;

        const geomById = new Map<string, any>();
        for (const g of (geoRows ?? []) as { alert_id: string; geometry: any }[]) {
          if (g.geometry) geomById.set(g.alert_id, g.geometry);
        }

        const rowsArr = lastRowsRef.current;
        const inline: WarningPolygon[] = [];
        const fallbackJobs: { r: AlertRow; promise: Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon | null> }[] = [];
        for (const r of rowsArr) {
          const g = geomById.get(r.alert_id);
          if (g) {
            inline.push(makePolygon(r, g));
            continue;
          }
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
          loading: false,
          error: null,
          lastUpdated: new Date(),
        });
        if (fallbackJobs.length === 0) return;

        const streamed: WarningPolygon[] = [];
        let rafQueued = false;
        const flush = () => {
          rafQueued = false;
          if (cancelled || polyVersionRef.current !== version) return;
          setPolygons((prev) => ({
            ...prev,
            polygons: [...inline, ...streamed],
            lastUpdated: new Date(),
          }));
        };
        for (const { r, promise } of fallbackJobs) {
          promise.then((g) => {
            if (g) streamed.push(makePolygon(r, g));
            if (!rafQueued) {
              rafQueued = true;
              (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : (cb: any) => setTimeout(cb, 16))(flush);
            }
          });
        }
      } catch (err) {
        if (cancelled) return;
        const msg = isAbortError(err) ? "Warning geometry timed out" : err instanceof Error ? err.message : "Failed to load polygons";
        setPolygons((p) => ({ ...p, loading: false, error: msg }));
      } finally {
        clearTimeout(timer);
      }
    }

    async function load() {
      // In-flight guard: realtime bursts + interval ticks can race when
      // Supabase is slow. Always release in `finally` so a failure can't
      // permanently wedge the refresh cycle.
      if (alertsFetchingRef.current) return;
      alertsFetchingRef.current = true;
      try {
        await loadSummary();
        if (polyTimer) clearTimeout(polyTimer);
        polyTimer = setTimeout(() => { void loadPolygons(); }, 250);
      } finally {
        alertsFetchingRef.current = false;
      }
    }
    loadAlertsRef.current = load;

    const scheduleLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void load(); }, REALTIME_DEBOUNCE_MS);
    };

    // Re-fetch polygons when the user navigates back from /account to the
    // map — summary is still fresh, but geometry was intentionally skipped.
    const onRouteChange = () => {
      if (typeof window === "undefined") return;
      if (!window.location.pathname.startsWith("/account")) {
        void loadPolygons();
      }
    };
    window.addEventListener("popstate", onRouteChange);

    // Staged startup: alerts are the core product, fire ASAP.
    const idleId = window.setTimeout(() => { void load(); }, 0);
    const cic = (id: number) => window.clearTimeout(id);

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
      if (polyTimer) clearTimeout(polyTimer);
      clearInterval(interval);
      window.removeEventListener("popstate", onRouteChange);
      void supabase.removeChannel(channel);
    };
  }, []);

  // -------- auth --------
  //
  // Dedup guard: getSession() and onAuthStateChange("INITIAL_SESSION") both
  // fire on mount, and previously each triggered its own profile fetch.
  // We coalesce concurrent fetches for the same user id into one promise,
  // and skip refetches when the user hasn't changed.
  const profileFetchRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const profileUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchProfile(userId: string, force = false): Promise<void> {
      // Coalesce concurrent fetches for the same user.
      const inflight = profileFetchRef.current;
      if (inflight && inflight.userId === userId) return inflight.promise;
      // Skip if we already have this user's profile and aren't forcing.
      if (!force && profileUserIdRef.current === userId) return;

      if (import.meta.env.DEV) console.count("[StormCircle] profile fetch");



      const promise = (async () => {
        // Hard timeout — profile fetch must never hang indefinitely
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("id,username,email,badge,meteorologist_applied,location,created_at")
            .eq("id", userId)
            .abortSignal(controller.signal)
            .maybeSingle();
          if (!mounted) return;
          if (error) {
            if (isAbortError(error)) console.warn("Profile fetch timed out; continuing without profile.");
            else console.error("Failed to load profile:", error);
            setProfile(null);
            return;
          }
          profileUserIdRef.current = userId;
          setProfile(data as Profile | null);
        } catch (err) {
          if (isAbortError(err)) console.warn("Profile fetch timed out; continuing without profile.");
          else console.error("Profile fetch failed:", err);
          if (mounted) setProfile(null);
        } finally {
          clearTimeout(timer);
          if (mounted) setProfileLoading(false);
          if (profileFetchRef.current?.userId === userId) {
            profileFetchRef.current = null;
          }
        }
      })();
      profileFetchRef.current = { userId, promise };
      return promise;
    }


    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const next = session?.user ?? null;
      setUser(next);
      if (next) {
        if (profileUserIdRef.current !== next.id) setProfileLoading(true);
        // Deferred to avoid the Supabase deadlock when calling supabase from
        // inside an auth event callback. Dedup guard above prevents the
        // duplicate fetch caused by getSession() racing INITIAL_SESSION.
        setTimeout(() => { if (mounted) void fetchProfile(next.id); }, 0);
      } else {
        profileUserIdRef.current = null;
        setProfile(null);
        setProfileLoading(false);
      }
    });

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        const existing = session?.user ?? null;
        setUser(existing);
        setAuthLoading(false);
        if (existing) {
          void fetchProfile(existing.id);
        } else {
          setProfileLoading(false);
        }
      })
      .catch((err) => {
        console.warn("getSession failed, treating as signed out:", err);
        if (mounted) {
          setUser(null);
          setProfile(null);
          setAuthLoading(false);
          setProfileLoading(false);
        }
      });


    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useMemo(() => async () => {
    await supabase.auth.signOut();
    profileUserIdRef.current = null;
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useMemo(() => async () => {
    if (!user) return;
    // Force a refetch (e.g. after LocationPicker save) but still coalesce
    // with any in-flight read for the same user.
    const inflight = profileFetchRef.current;
    if (inflight && inflight.userId === user.id) {
      await inflight.promise;
      // Then do one more fetch to pick up the just-saved row.
    }
    const promise = (async () => {
      // Perf/reliability: mirror the initial fetchProfile 5s abort so a slow
      // DB during a save can't leave refreshProfile hanging indefinitely.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id,username,email,badge,meteorologist_applied,location,created_at")
          .eq("id", user.id)
          .abortSignal(controller.signal)
          .maybeSingle();
        if (error) {
          if (isAbortError(error)) console.warn("refreshProfile timed out; keeping last-good profile.");
          else console.error("Failed to refresh profile:", error);
          return;
        }
        profileUserIdRef.current = user.id;
        setProfile(data as Profile | null);
      } catch (err) {
        if (isAbortError(err)) console.warn("refreshProfile timed out; keeping last-good profile.");
        else console.error("refreshProfile failed:", err);
      } finally {
        clearTimeout(timer);
        if (profileFetchRef.current?.userId === user.id) {
          profileFetchRef.current = null;
        }
      }
    })();
    profileFetchRef.current = { userId: user.id, promise };
    await promise;
  }, [user]);

  // -------- LSR --------
  const lsrFetchingRef = useRef(false);
  useEffect(() => {
    let cancelled = false;

    const fetchReports = async () => {
      // In-flight guard: a slow IEM response must not let the next tick
      // start a second concurrent fetch. `finally` always releases.
      if (lsrFetchingRef.current) return;
      lsrFetchingRef.current = true;
      try {
        const res = await fetchWithTimeout(LSR_URL);
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
      } finally {
        lsrFetchingRef.current = false;
      }
    };

    // Expose for the watchdog to re-fire during recovery.
    lsrFetchRef.current = () => { void fetchReports(); };

    // Stagger LSR ~800ms after mount: non-critical, can lag a beat.
    const startId = window.setTimeout(() => { void fetchReports(); }, 800);
    const id = setInterval(fetchReports, LSR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(startId);
    };
  }, []);

  // -------- watchdog --------
  //
  // Flip appReady the moment the first alerts load resolves. KEEP-LAST-GOOD
  // means an error still counts as "ready" — we just stop showing the boot
  // skeleton and let the existing per-section error states handle it.
  useEffect(() => {
    if (!alerts.loading && !appReady) setAppReady(true);
  }, [alerts.loading, appReady]);

  // Arm a 15 s watchdog while not ready. Re-arms after each recovery attempt
  // so a still-stuck app keeps trying instead of giving up.
  useEffect(() => {
    if (appReady) {
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      return;
    }
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      console.warn("[StormCircle] Watchdog triggered — app appears stuck, forcing recovery");
      setRecoveryAttempt((n) => n + 1);
    }, 15_000);
    return () => {
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
    };
  }, [appReady, recoveryAttempt]);

  // Execute recovery: release every in-flight guard so a wedged ref can't
  // block the next fetch, refresh the Supabase session + realtime socket,
  // then re-fire the loaders.
  useEffect(() => {
    if (recoveryAttempt === 0) return;
    console.warn(`[StormCircle] Recovery attempt #${recoveryAttempt}`);
    alertsFetchingRef.current = false;
    lsrFetchingRef.current = false;
    void supabase.auth.getSession().catch(() => {});
    try { supabase.realtime.connect(); } catch { /* already connected */ }
    loadAlertsRef.current?.();
    const t = setTimeout(() => lsrFetchRef.current?.(), 800);
    return () => clearTimeout(t);
  }, [recoveryAttempt]);

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
    // Stagger presence ~1200ms after mount so it lands after alerts + LSR.
    const startId = window.setTimeout(start, 1200);
    return () => {
      clearTimeout(startId);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const value = useMemo<DataContextValue>(() => ({
    alerts, polygons,
    auth: { user, profile, loading: authLoading, profileLoading, signOut, refreshProfile },
    lsr, onlineCount, appReady, recoveryAttempt,
  }), [alerts, polygons, user, profile, authLoading, profileLoading, signOut, refreshProfile, lsr, onlineCount, appReady, recoveryAttempt]);

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
