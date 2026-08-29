/**
 * useLifetimeVisitors - registers this device once as a site visitor and
 * exposes the lifetime unique visitor count.
 *
 * A random visitor id is stored in localStorage so repeat visits from the
 * same browser are counted once. The RPC upserts the row and returns the
 * total in a single round-trip.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "sc-visitor-id";

let cachedCount: number | null = null;
let inflight: Promise<number | null> | null = null;

const getVisitorId = () => {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
};

const registerVisit = async (): Promise<number | null> => {
  if (cachedCount != null) return cachedCount;
  if (!inflight) {
    inflight = supabase
      .rpc("register_visit", { _visitor_id: getVisitorId() })
      .then(({ data, error }) => {
        if (error) return null;
        cachedCount = typeof data === "number" ? data : Number(data);
        return cachedCount;
      })
      .catch(() => null);
  }
  return inflight;
};

export function useLifetimeVisitors() {
  const [count, setCount] = useState<number | null>(cachedCount);

  useEffect(() => {
    let alive = true;
    registerVisit().then((v) => {
      if (alive && v != null) setCount(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  return count;
}
