/**
 * useNewReportPing — emits an incrementing counter every time a new SKYWARN
 * citizen report is inserted into the `messages` table via Supabase Realtime.
 *
 * Consumers can watch the returned `pingId` in a useEffect to trigger
 * one-shot UI effects (e.g. a glow animation on the left menu button).
 *
 * The first hydration after mount is intentionally NOT counted — only inserts
 * received after the realtime subscription is live will trigger a ping.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useNewReportPing(): number {
  const [pingId, setPingId] = useState(0);

  useEffect(() => {
    const channel = supabase
      .channel("new-report-ping")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => setPingId((n) => n + 1),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return pingId;
}
