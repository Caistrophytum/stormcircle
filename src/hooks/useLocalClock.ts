/**
 * useLocalClock — resolves the IANA timezone for a lat/lon via Open-Meteo
 * (cached per rounded coordinate) and returns a ticking HH:MM local time
 * string for that location. Falls back to UTC while resolving / on error.
 */
import { useEffect, useState } from "react";

const tzCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function keyFor(lat: number, lon: number) {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

async function resolveTimezone(lat: number, lon: number): Promise<string> {
  const key = keyFor(lat, lon);
  const cached = tzCache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&timezone=auto&forecast_days=1&current=temperature_2m`,
      );
      const json = await res.json();
      const tz: string = json?.timezone ?? "UTC";
      tzCache.set(key, tz);
      return tz;
    } catch {
      return "UTC";
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function useLocalClock(lat?: number | null, lon?: number | null) {
  const [tz, setTz] = useState<string>("UTC");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    if (lat == null || lon == null) {
      setTz("UTC");
      return;
    }
    resolveTimezone(lat, lon).then((t) => {
      if (!cancelled) setTz(t);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  let label: string;
  try {
    label = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(now);
  } catch {
    label = now.toISOString().slice(11, 16);
  }

  return { time: label, timezone: tz, isUTC: tz === "UTC" };
}
