/**
 * useNotifications - in-app notification inbox.
 *
 * Loads the signed-in user's recent notifications, keeps them live over a
 * single realtime channel, exposes the unread count and toasts anything that
 * arrives while the tab is open.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  category: string;
  severity: string | null;
  read: boolean;
  created_at: string;
}

const LIMIT = 30;

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, category, severity, read, created_at")
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (!cancelled) {
        setItems((data ?? []) as AppNotification[]);
        setLoading(false);
      }
    };
    void load();

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as AppNotification;
          setItems((prev) => [row, ...prev.filter((n) => n.id !== row.id)].slice(0, LIMIT));
          toast(row.title, { description: row.body });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const oldId = (payload.old as { id?: string })?.id;
          if (oldId) setItems((prev) => prev.filter((n) => n.id !== oldId));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const markAllRead = useCallback(async () => {
    const unread = items.filter((n) => !n.read).map((n) => n.id);
    if (!unread.length) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", unread);
  }, [items]);

  const clearAll = useCallback(async () => {
    const ids = items.map((n) => n.id);
    if (!ids.length) return;
    setItems([]);
    await supabase.from("notifications").delete().in("id", ids);
  }, [items]);

  return {
    items,
    loading,
    unread: items.filter((n) => !n.read).length,
    markAllRead,
    clearAll,
  };
}
