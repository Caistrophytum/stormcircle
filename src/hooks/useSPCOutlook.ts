/**
 * useSPCOutlook — formerly polled SPC client-side. Now a no-op: the
 * `spc-poll` edge function fetches the outlook on a 5-minute pg_cron schedule
 * and writes the SPC Bot message directly. Clients receive it via the
 * existing messages Realtime subscription.
 *
 * Kept as an export so the call site in pages/Index.tsx remains a thin
 * "mount data-bots" hook. Add additional client-side wiring here later if
 * we ever need it.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSPCOutlook(): void {
  // intentional no-op
}

/**
 * Loading flag derived from the server-side `spc_outlook_state` row.
 * Flips true briefly when last_run_at is older than the expected 5-minute
 * cadence, false otherwise. Kept for callers that already render a "fetching
 * outlook" indicator.
 */
export function useSPCOutlookLoading(): boolean {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase
        .from("spc_outlook_state")
        .select("last_run_at")
        .eq("id", 1)
        .maybeSingle();
      if (cancelled) return;
      if (!data?.last_run_at) {
        setLoading(true);
        return;
      }
      const ageMs = Date.now() - new Date(data.last_run_at).getTime();
      // If the cron hasn't run in >10 min, consider the feed "loading".
      setLoading(ageMs > 10 * 60 * 1000);
    };
    void check();
    const id = setInterval(check, 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return loading;
}
