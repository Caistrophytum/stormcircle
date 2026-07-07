/**
 * BotsTab — grid of bot buttons (SPC, Fire, Hurricane, others).
 * Clicking a button opens a FloatingWindow with that bot's latest messages.
 */
import { useEffect, useMemo, useState } from "react";
import { Bot, Zap, Flame, Wind } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { RawMessage } from "@/lib/reportGrouping";
import { SystemMessageCard } from "@/components/SystemMessageCard";
import FloatingWindow from "@/components/desktop/FloatingWindow";

const KNOWN_BOTS: Record<string, { label: string; accent: string; Icon: typeof Bot }> = {
  "00000000-0000-0000-0000-000000000000": { label: "Convective Weather Bot", accent: "255,165,0", Icon: Zap },
  "00000000-0000-0000-0000-000000000001": { label: "Hurricane Weather Bot", accent: "0,170,255", Icon: Wind },
  "00000000-0000-0000-0000-000000000002": { label: "Fire Weather Bot", accent: "255,107,26", Icon: Flame },
};

export default function BotsTab() {
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [openBotId, setOpenBotId] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("messages")
      .select("id,user_id,username,badge,content,created_at")
      .eq("badge", "System")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!cancelled && data) setMessages(data as RawMessage[]);
      });

    const ch = supabase
      .channel(`bots-tab_${Math.random().toString(36).slice(2)}_${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as RawMessage;
          if (row.badge !== "System") return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [row, ...prev].slice(0, 30);
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, []);

  const byBot = useMemo(() => {
    const map = new Map<string, RawMessage[]>();
    for (const m of messages) {
      const arr = map.get(m.user_id) ?? [];
      arr.push(m);
      map.set(m.user_id, arr);
    }
    return map;
  }, [messages]);

  // Show known bots first, then any discovered bots.
  const botIds = useMemo(() => {
    const seen = new Set(Object.keys(KNOWN_BOTS));
    const extras: string[] = [];
    for (const id of byBot.keys()) if (!seen.has(id)) extras.push(id);
    return [...Object.keys(KNOWN_BOTS), ...extras];
  }, [byBot]);

  const openMessages = openBotId ? byBot.get(openBotId) ?? [] : [];
  const openMeta = openBotId
    ? KNOWN_BOTS[openBotId] ?? { label: openMessages[0]?.username ?? "Bot", accent: "180,180,180", Icon: Bot }
    : null;

  const toggle = (id: string) =>
    setExpandedKey((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="p-4">
      <div className="flex flex-col gap-2">
        {botIds.map((id) => {
          const meta = KNOWN_BOTS[id] ?? {
            label: byBot.get(id)?.[0]?.username ?? "Bot",
            accent: "180,180,180",
            Icon: Bot,
          };
          const latest = byBot.get(id)?.[0];
          const hasMessages = !!latest;
          return (
            <button
              key={id}
              onClick={() => hasMessages && setOpenBotId(id)}
              disabled={!hasMessages}
              className="group flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: `1px solid rgba(${meta.accent},0.4)`,
                boxShadow: `inset 0 0 12px rgba(${meta.accent},0.12), 0 0 8px rgba(${meta.accent},0.18)`,
              }}
            >
              <meta.Icon size={18} style={{ color: `rgb(${meta.accent})` }} />
              <div className="flex flex-1 flex-col">
                <div
                  className="font-mono text-[11px] font-bold uppercase leading-tight tracking-wider"
                  style={{ color: `rgb(${meta.accent})` }}
                >
                  {meta.label}
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  {hasMessages
                    ? `Last message ${new Date(latest.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "No messages"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <FloatingWindow
        open={!!openBotId}
        onClose={() => setOpenBotId(null)}
        title={openMeta?.label ?? "Bot"}
        subtitle={`${openMessages.length} recent message${openMessages.length === 1 ? "" : "s"}`}
        accent={openMeta?.accent}
        width="33vw"
        height="min(80dvh, 780px)"
      >
        <div className="space-y-3 p-4 text-[13px]">
          {openMessages.length === 0 && (
            <p className="text-center font-mono text-xs text-muted-foreground">No messages yet.</p>
          )}
          {openMessages.map((m) => (
            <div key={m.id} className="[&_*]:!text-[13px]">
              <SystemMessageCard message={m} expandedKey={expandedKey} toggle={toggle} />
            </div>
          ))}
        </div>
      </FloatingWindow>
    </div>
  );
}
