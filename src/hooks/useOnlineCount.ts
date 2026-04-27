import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOnlineCount() {
  const [count, setCount] = useState(1);

  useEffect(() => {
    const channel = supabase.channel("online-users", {
      config: { presence: { key: crypto.randomUUID() } },
    });

    const updateCount = () => {
      const state = channel.presenceState();
      setCount(Object.keys(state).length);
    };

    channel
      .on("presence", { event: "sync" }, updateCount)
      .on("presence", { event: "join" }, updateCount)
      .on("presence", { event: "leave" }, updateCount)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
