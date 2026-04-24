/**
 * CitizenReports — global citizen report stream with a 2-hour rolling history.
 *
 * Data flow:
 *   1. On mount, hydrate with messages from the last 2 hours (server-side filter).
 *   2. Subscribe to Supabase Realtime postgres_changes for INSERT/DELETE so
 *      every connected client stays in sync without polling.
 *   3. Defensive client-side sweep every minute prunes anything older than 2h
 *      from local state in case a realtime DELETE event was missed (the
 *      server pg_cron job purges the row every 5 minutes).
 *
 * Auth model:
 *   - Anyone (including guests) can READ the chat.
 *   - Only authenticated users can SEND. Input is hidden from guests.
 *   - Content is hard-capped at 500 chars client-side; the row is inserted
 *     with the user's own profile.username + badge so spoofing another user
 *     is blocked by the RLS check (auth.uid() = user_id).
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { groupMessages, type RawMessage } from "@/lib/reportGrouping";

type Message = RawMessage;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 500;

export default function CitizenReports() {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Derive grouped, ranked stacks from the live message list.
  const stacks = useMemo(() => groupMessages(messages), [messages]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Initial load: pull the last 2 hours of history ────────────────────
  useEffect(() => {
    const cutoff = new Date(Date.now() - TWO_HOURS_MS).toISOString();
    supabase
      .from("messages")
      .select("*")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as Message[]);
      });
  }, []);

  // ── Realtime: live INSERT/DELETE updates ──────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("public-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          setMessages((prev) => {
            const next = payload.new as Message;
            // Avoid dupes if the row was already in the initial fetch.
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== (payload.old as { id: string }).id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // (Auto-scroll removed — stacks are sorted by count, not chronology.)

  // ── Client-side expiry sweep (defense-in-depth vs server pg_cron) ─────
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - TWO_HOURS_MS;
      setMessages((prev) =>
        prev.filter((m) => new Date(m.created_at).getTime() > cutoff)
      );
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || !user || !profile || sending) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      user_id: user.id,
      username: profile.username,
      badge: profile.badge,
      content: trimmed.slice(0, MAX_MESSAGE_LENGTH),
    });
    if (!error) setInput("");
    setSending(false);
  }

  // Whether the signed-in user can remove a given message.
  // RLS enforces this server-side too — this just hides the button when not allowed.
  const isModerator = profile?.badge === "Meteorologist";
  function canDelete(msg: Message) {
    if (!user) return false;
    return msg.user_id === user.id || isModerator;
  }

  async function deleteMessage(id: string) {
    // Optimistic: remove locally; Realtime DELETE will keep other clients in sync.
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete message:", error);
      // Re-fetch on failure so UI doesn't drift from the DB.
      const cutoff = new Date(Date.now() - TWO_HOURS_MS).toISOString();
      const { data } = await supabase
        .from("messages")
        .select("*")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true });
      if (data) setMessages(data as Message[]);
    }
  }

  return (
    <aside className="w-80 h-full border-l border-border bg-cockpit flex flex-col shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-border bg-shroud/30">
        <h3 className="text-xs font-mono font-bold text-card-foreground uppercase flex items-center gap-2">
          <span className="size-1.5 bg-primary rounded-full animate-pulse" />
          Citizen Reports
        </h3>
        <p className="text-[9px] font-mono text-muted-foreground mt-1 uppercase">
          2-hour rolling history
        </p>
      </div>

      {/* Stacked reports */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {stacks.length === 0 ? (
          <p className="text-[10px] font-mono text-muted-foreground italic text-center pt-4">
            No reports yet. Be the first to report an event.
          </p>
        ) : (
          stacks.map((stack) => {
            const isOpen = expanded.has(stack.id);
            return (
              <div
                key={stack.id}
                className="bg-shroud border border-border"
              >
                {/* Stack header — clickable to expand */}
                <button
                  type="button"
                  onClick={() => toggleExpand(stack.id)}
                  className="w-full text-left px-2 py-1.5 space-y-1 hover:bg-background/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[8px] font-mono px-1 py-0.5 border rounded uppercase shrink-0 ${
                        stack.badge === "Meteorologist"
                          ? "border-neon-green/30 text-neon-green bg-neon-green/5"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {stack.badge}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] font-mono text-muted-foreground">
                        {new Date(stack.latestTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {stack.count > 1 && (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-primary/15 border border-primary/30 text-primary rounded">
                          ×{stack.count}
                        </span>
                      )}
                      <span className="text-[9px] font-mono text-muted-foreground">
                        {isOpen ? "▾" : "▸"}
                      </span>
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-foreground/90 leading-snug break-words whitespace-pre-wrap">
                    {stack.topic}
                  </p>
                </button>

                {/* Expanded individual reports */}
                {isOpen && stack.reports.length > 1 && (
                  <ul className="border-t border-border bg-background/20 divide-y divide-border/50">
                    {stack.reports.map((r) => (
                      <li key={r.id} className="px-2 py-1.5 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono font-bold text-card-foreground truncate">
                            {r.username}
                          </span>
                          <span className="text-[9px] font-mono text-muted-foreground shrink-0">
                            {new Date(r.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-foreground/80 leading-snug break-words whitespace-pre-wrap">
                          {r.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border bg-shroud/30">
        {user && profile ? (
          <>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Report an event..."
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={sending}
                className="flex-1 bg-background/50 border border-border px-2 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim()}
                className="px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary font-mono text-[10px] uppercase font-bold hover:bg-primary hover:text-background transition-all rounded-sm disabled:opacity-40 disabled:hover:bg-primary/10 disabled:hover:text-primary"
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
            <p className="text-[9px] font-mono text-muted-foreground mt-1.5 text-right">
              {input.length}/{MAX_MESSAGE_LENGTH}
            </p>
          </>
        ) : (
          <div className="text-center py-2 px-3 bg-background/30 border border-border rounded-sm">
            <p className="text-[10px] font-mono text-muted-foreground uppercase leading-relaxed">
              Sign in to report an event
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
