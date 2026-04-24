/**
 * CitizenReports — global citizen report stream with a 2-hour rolling history.
 *
 * Data flow:
 *   1. On mount, hydrate with the last 2 hours of messages AND the current
 *      set of approved topic signatures.
 *   2. Subscribe to Supabase Realtime for INSERT/DELETE on `messages` and
 *      INSERT/DELETE on `report_approvals` so every connected client stays
 *      in sync without polling.
 *   3. Defensive client-side sweep every minute prunes anything older than 2h
 *      from local state (the server pg_cron job purges rows every 5 min).
 *
 * Auth model:
 *   - Anyone (including guests) can READ chat + approvals.
 *   - Only authenticated users can SEND.
 *   - Citizens can DELETE their own messages.
 *   - Meteorologists can DELETE any message AND approve/unapprove topics.
 *   - Meteorologist messages auto-approve their topic via a DB trigger.
 *
 * Approval model:
 *   - Approval is keyed by a deterministic *signature* of the message
 *     (lowercase, dedup tokens, sorted, "|"-joined). The same signature is
 *     computed in JS (`messageSignature`) and SQL (`public.message_signature`),
 *     so an approval persisted in `report_approvals` matches every report
 *     that produces the same signature — present and future.
 *
 * Sort priority (top → bottom):
 *   approved+trending → approved → unapproved+trending → unapproved
 *   (within ties: count desc, then most-recent first).
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  groupMessages,
  messageSignature,
  type RawMessage,
  type StackedReport,
} from "@/lib/reportGrouping";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Message = RawMessage;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 500;

// Action queued behind the confirmation dialog.
type PendingAction =
  | { kind: "delete-message"; id: string; preview: string }
  | { kind: "delete-stack"; ids: string[]; topic: string; count: number };

export default function CitizenReports() {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [approvedSigs, setApprovedSigs] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingAction | null>(null);

  const isModerator = profile?.badge === "Meteorologist";

  // ── Derive grouped, ranked stacks from live state ─────────────────────
  const stacks = useMemo(
    () => groupMessages(messages, approvedSigs),
    [messages, approvedSigs],
  );

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Initial load ──────────────────────────────────────────────────────
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

    supabase
      .from("report_approvals")
      .select("signature")
      .then(({ data }) => {
        if (data) setApprovedSigs(new Set(data.map((r) => r.signature)));
      });
  }, []);

  // ── Realtime: messages + approvals ────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("citizen-reports")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          setMessages((prev) => {
            const next = payload.new as Message;
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          setMessages((prev) =>
            prev.filter((m) => m.id !== (payload.old as { id: string }).id),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "report_approvals" },
        (payload) => {
          const sig = (payload.new as { signature: string }).signature;
          setApprovedSigs((prev) => {
            if (prev.has(sig)) return prev;
            const next = new Set(prev);
            next.add(sig);
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "report_approvals" },
        (payload) => {
          const sig = (payload.old as { signature: string }).signature;
          setApprovedSigs((prev) => {
            if (!prev.has(sig)) return prev;
            const next = new Set(prev);
            next.delete(sig);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Client-side expiry sweep (defense-in-depth vs server pg_cron) ─────
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - TWO_HOURS_MS;
      setMessages((prev) =>
        prev.filter((m) => new Date(m.created_at).getTime() > cutoff),
      );
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // ── Send ──────────────────────────────────────────────────────────────
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
    if (error) {
      toast.error("Failed to send report");
    } else {
      setInput("");
    }
    setSending(false);
  }

  // ── Permission helpers ────────────────────────────────────────────────
  // (RLS enforces these server-side too — UI just hides disallowed buttons.)
  function canDelete(msg: Message) {
    if (!user) return false;
    return msg.user_id === user.id || isModerator;
  }
  function canDeleteStack(stack: StackedReport) {
    // Stack delete is moderator-only per requirement.
    return isModerator;
  }

  // ── Mutations ─────────────────────────────────────────────────────────
  async function reallyDeleteMessages(ids: string[]) {
    // Optimistic: drop locally; Realtime DELETE keeps other clients in sync.
    const idSet = new Set(ids);
    setMessages((prev) => prev.filter((m) => !idSet.has(m.id)));
    const { error } = await supabase.from("messages").delete().in("id", ids);
    if (error) {
      toast.error("Failed to remove report");
      // Re-fetch on failure so UI doesn't drift from the DB.
      const cutoff = new Date(Date.now() - TWO_HOURS_MS).toISOString();
      const { data } = await supabase
        .from("messages")
        .select("*")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true });
      if (data) setMessages(data as Message[]);
    } else {
      toast.success(ids.length === 1 ? "Report removed" : `${ids.length} reports removed`);
    }
  }

  async function approveStack(stack: StackedReport) {
    if (!user || !isModerator) return;
    // Optimistic
    setApprovedSigs((prev) => {
      const next = new Set(prev);
      next.add(stack.signature);
      return next;
    });
    const { error } = await supabase.from("report_approvals").upsert(
      { signature: stack.signature, approved_by: user.id },
      { onConflict: "signature" },
    );
    if (error) {
      toast.error("Failed to approve");
      setApprovedSigs((prev) => {
        const next = new Set(prev);
        next.delete(stack.signature);
        return next;
      });
    } else {
      toast.success("Topic approved");
    }
  }

  async function unapproveStack(stack: StackedReport) {
    if (!user || !isModerator) return;
    setApprovedSigs((prev) => {
      const next = new Set(prev);
      next.delete(stack.signature);
      return next;
    });
    const { error } = await supabase
      .from("report_approvals")
      .delete()
      .eq("signature", stack.signature);
    if (error) {
      toast.error("Failed to unapprove");
      setApprovedSigs((prev) => {
        const next = new Set(prev);
        next.add(stack.signature);
        return next;
      });
    } else {
      toast.success("Approval removed");
    }
  }

  // ── Confirmation dialog ───────────────────────────────────────────────
  function confirmAndRun() {
    if (!pending) return;
    if (pending.kind === "delete-message") {
      void reallyDeleteMessages([pending.id]);
    } else {
      void reallyDeleteMessages(pending.ids);
    }
    setPending(null);
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
            const soloReport = stack.reports[0];
            const isSolo = stack.count === 1;
            const showSoloDelete = isSolo && canDelete(soloReport);
            const showStackDelete = !isSolo && canDeleteStack(stack);
            const showApprove = isModerator && !stack.approved;
            const showUnapprove = isModerator && stack.approved;
            return (
              <div
                key={stack.id}
                className={`bg-shroud border ${
                  stack.approved
                    ? "border-neon-green/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.05)]"
                    : "border-border"
                }`}
              >
                {/* Stack header — clickable to expand */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(stack.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(stack.id);
                    }
                  }}
                  className="w-full text-left px-2 py-1.5 space-y-1 hover:bg-background/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-[8px] font-mono px-1 py-0.5 border rounded uppercase shrink-0 ${
                          stack.badge === "Meteorologist"
                            ? "border-neon-green/30 text-neon-green bg-neon-green/5"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {stack.badge}
                      </span>
                      {stack.approved && (
                        <span className="text-[8px] font-mono px-1 py-0.5 border border-neon-green/40 bg-neon-green/10 text-neon-green rounded uppercase shrink-0">
                          ✓ Approved
                        </span>
                      )}
                    </div>
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

                  {/* Action row (approve / delete) */}
                  {(showApprove || showUnapprove || showSoloDelete || showStackDelete) && (
                    <div
                      className="flex items-center gap-1.5 pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {showApprove && (
                        <button
                          type="button"
                          onClick={() => approveStack(stack)}
                          className="text-[9px] font-mono uppercase font-bold px-2 py-0.5 border border-neon-green/40 text-neon-green hover:bg-neon-green/10 rounded transition-colors"
                        >
                          ✓ Approve
                        </button>
                      )}
                      {showUnapprove && (
                        <button
                          type="button"
                          onClick={() => unapproveStack(stack)}
                          className="text-[9px] font-mono uppercase font-bold px-2 py-0.5 border border-border text-muted-foreground hover:border-foreground hover:text-foreground rounded transition-colors"
                        >
                          Unapprove
                        </button>
                      )}
                      {showSoloDelete && (
                        <button
                          type="button"
                          onClick={() =>
                            setPending({
                              kind: "delete-message",
                              id: soloReport.id,
                              preview: soloReport.content,
                            })
                          }
                          aria-label="Remove report"
                          className="ml-auto text-[10px] font-mono leading-none px-1.5 py-0.5 border border-border text-muted-foreground hover:border-destructive hover:text-destructive rounded transition-colors"
                        >
                          ×
                        </button>
                      )}
                      {showStackDelete && (
                        <button
                          type="button"
                          onClick={() =>
                            setPending({
                              kind: "delete-stack",
                              ids: stack.reports.map((r) => r.id),
                              topic: stack.topic,
                              count: stack.count,
                            })
                          }
                          aria-label="Remove entire stack"
                          className="ml-auto text-[9px] font-mono uppercase font-bold px-2 py-0.5 border border-border text-muted-foreground hover:border-destructive hover:text-destructive rounded transition-colors"
                        >
                          × Remove all
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Expanded individual reports */}
                {isOpen && stack.reports.length > 1 && (
                  <ul className="border-t border-border bg-background/20 divide-y divide-border/50">
                    {stack.reports.map((r) => (
                      <li key={r.id} className="px-2 py-1.5 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono font-bold text-card-foreground truncate">
                            {r.username}
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] font-mono text-muted-foreground">
                              {new Date(r.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {canDelete(r) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPending({
                                    kind: "delete-message",
                                    id: r.id,
                                    preview: r.content,
                                  })
                                }
                                aria-label="Remove report"
                                className="text-[10px] font-mono leading-none px-1 py-0.5 border border-border text-muted-foreground hover:border-destructive hover:text-destructive rounded transition-colors"
                              >
                                ×
                              </button>
                            )}
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

      {/* Deletion confirmation dialog */}
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "delete-stack"
                ? `Remove all ${pending.count} reports in this stack?`
                : "Remove this report?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "delete-stack"
                ? `Topic: "${pending.topic}". This will permanently remove every report grouped under this topic. This cannot be undone.`
                : pending?.kind === "delete-message"
                  ? `"${pending.preview}" will be permanently removed. This cannot be undone.`
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAndRun}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
