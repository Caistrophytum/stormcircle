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
 *   - Any signed-in user (Citizen or Meteorologist) can SEND messages.
 *   - Only Meteorologists can DELETE messages (single or whole stack).
 *   - Only Meteorologists can approve/unapprove topics.
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, ChevronDown, X as XIcon } from "lucide-react";
import type { GeocodedCity } from "@/hooks/useCitySearch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCitySearch } from "@/hooks/useCitySearch";
import { groupMessages, messageSignature, type RawMessage, type StackedReport } from "@/lib/reportGrouping";
import { useReportDistances } from "@/hooks/useReportDistances";

type SortMode = "default" | "newest" | "nearest";

/** Curated list of reportable phenomena. Labels are inserted verbatim into
 *  the composed message, so they should already match grouping vocabulary
 *  in `reportGrouping.ts` (METEO_WORDS / SYNONYMS). */
const PHENOMENA: { label: string; value: string }[] = [
  { label: "Tornado", value: "Tornado" },
  { label: "Funnel cloud", value: "Funnel cloud" },
  { label: "Wall cloud", value: "Wall cloud" },
  { label: "Hail", value: "Hail" },
  { label: "Heavy rain", value: "Heavy rain" },
  { label: "Thunderstorm", value: "Thunderstorm" },
  { label: "Lightning", value: "Lightning" },
  { label: "Damaging wind", value: "Damaging wind" },
  { label: "Flooding", value: "Flooding" },
  { label: "Snow", value: "Snow" },
  { label: "Blizzard", value: "Blizzard" },
  { label: "Ice / freezing rain", value: "Freezing rain" },
  { label: "Fog", value: "Fog" },
  { label: "Power outage", value: "Power outage" },
  { label: "Tree down", value: "Tree down" },
  { label: "Road flooded", value: "Road flooded" },
];

const RELATIONS = ["in", "near", "heading towards"] as const;
type Relation = (typeof RELATIONS)[number];
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
import { SystemMessageCard } from "@/components/SystemMessageCard";
import { useSPCOutlookLoading } from "@/hooks/useSPCOutlook";

type Message = RawMessage;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 500;
// Bound on how many messages we hold in client state at once. The oldest
// 2-hour window holds whatever fits — older rows fall off as new ones arrive.
const MAX_INITIAL_MESSAGES = 500;

// Action queued behind the confirmation dialog.
type PendingAction =
  | { kind: "delete-message"; id: string; preview: string }
  | { kind: "delete-stack"; ids: string[]; topic: string; count: number };

export default function CitizenReports() {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [approvedSigs, setApprovedSigs] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [showNearestDialog, setShowNearestDialog] = useState(false);

  // Structured composer state
  const [phenomenon, setPhenomenon] = useState<string | null>(null);
  const [relation, setRelation] = useState<Relation | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const placeTouchStartY = useRef<number | null>(null);
  const { results: placeResults, loading: placeLoading } = useCitySearch(placeQuery);

  const spcLoading = useSPCOutlookLoading();

  const isModerator = profile?.badge === "Meteorologist";

  // ── Split out automated bot messages (badge "System") ────────────────
  // System messages (e.g. SPC Bot outlook updates) bypass grouping and
  // render as standalone styled cards pinned above the regular stacks.
  const { systemMessages, userMessages } = useMemo(() => {
    const sys: Message[] = [];
    const usr: Message[] = [];
    for (const m of messages) (m.badge === "System" ? sys : usr).push(m);
    // Newest system messages first.
    sys.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    // Defensive dedupe: if a race in the SPC bot ever produces multiple rows
    // for the same outlook, only render the newest one per (user_id, issue
    // timestamp). Falls back to user_id when the marker is absent so legacy
    // bots collapse to a single card too.
    const seen = new Set<string>();
    const dedupedSys: Message[] = [];
    for (const m of sys) {
      const issueMatch = m.content.match(/<!--issue:(\d{12})-->/);
      const key = `${m.user_id}::${issueMatch ? issueMatch[1] : "noissue"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedSys.push(m);
    }
    return { systemMessages: dedupedSys, userMessages: usr };
  }, [messages]);

  // ── Derive grouped, ranked stacks from non-system messages ──────────
  const stacks = useMemo(() => groupMessages(userMessages, approvedSigs), [userMessages, approvedSigs]);

  const homeLocation = profile?.location ?? null;
  const canSortByLocation = !!user && !!homeLocation;

  // If user picks "nearest" then loses eligibility, fall back to default.
  useEffect(() => {
    if (sortMode === "nearest" && !canSortByLocation) setSortMode("default");
  }, [sortMode, canSortByLocation]);

  const distances = useReportDistances(stacks, homeLocation, sortMode === "nearest");

  const sortedStacks = useMemo(() => {
    if (sortMode === "default") return stacks;
    const arr = [...stacks];
    if (sortMode === "newest") {
      arr.sort(
        (a, b) => new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime(),
      );
      return arr;
    }
    // nearest
    arr.sort((a, b) => {
      const da = distances.get(a.id) ?? Infinity;
      const db = distances.get(b.id) ?? Infinity;
      if (da !== db) return da - db;
      return new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime();
    });
    return arr;
  }, [stacks, sortMode, distances]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const reloadMessages = useCallback(async () => {
    const cutoff = new Date(Date.now() - TWO_HOURS_MS).toISOString();

    const [{ data: recent }, { data: system }] = await Promise.all([
      supabase
        .from("messages")
        .select("*")
        .neq("badge", "System")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(MAX_INITIAL_MESSAGES),
      supabase
        .from("messages")
        .select("*")
        .eq("badge", "System")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const merged = [...(recent as Message[] | null | undefined ?? []), ...(system as Message[] | null | undefined ?? [])];
    const deduped = Array.from(new Map(merged.map((message) => [message.id, message])).values());
    deduped.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    setMessages(deduped);
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────
  // Regular user reports are limited to the last 2 hours, while system
  // outlooks stay visible until replaced by a newer issuance.
  useEffect(() => {
    void reloadMessages();

    supabase
      .from("report_approvals")
      .select("signature")
      .then(({ data }) => {
        if (data) setApprovedSigs(new Set(data.map((r) => r.signature)));
      });
  }, [reloadMessages]);

  // ── Realtime: messages + approvals ────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("citizen-reports")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        setMessages((prev) => {
          const next = payload.new as Message;
          if (prev.some((m) => m.id === next.id)) return prev;
          // Bound in-memory messages: drop the oldest if we exceed the cap.
          const appended = [...prev, next];
          return appended.length > MAX_INITIAL_MESSAGES
            ? appended.slice(appended.length - MAX_INITIAL_MESSAGES)
            : appended;
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== (payload.old as { id: string }).id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "report_approvals" }, (payload) => {
        const sig = (payload.new as { signature: string }).signature;
        setApprovedSigs((prev) => {
          if (prev.has(sig)) return prev;
          const next = new Set(prev);
          next.add(sig);
          return next;
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "report_approvals" }, (payload) => {
        const sig = (payload.old as { signature: string }).signature;
        setApprovedSigs((prev) => {
          if (!prev.has(sig)) return prev;
          const next = new Set(prev);
          next.delete(sig);
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Client-side expiry sweep (defense-in-depth vs server pg_cron) ─────
  // System (bot) messages are exempt — they persist until replaced by a
  // newer issuance.
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - TWO_HOURS_MS;
      setMessages((prev) =>
        prev.filter((m) => m.badge === "System" || new Date(m.created_at).getTime() > cutoff),
      );
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // ── Send ──────────────────────────────────────────────────────────────
  function resetComposer() {
    setPhenomenon(null);
    setRelation(null);
    setPlaceQuery("");
    setPlaceLabel(null);
  }

  async function sendReport() {
    if (!user || !profile || sending) return;
    if (!phenomenon || !relation || !placeLabel) return;
    const content = `${phenomenon} ${relation} ${placeLabel}`.slice(0, MAX_MESSAGE_LENGTH);
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      user_id: user.id,
      username: profile.username,
      badge: profile.badge,
      content,
    });
    if (error) {
      toast.error("Failed to send report");
    } else {
      resetComposer();
    }
    setSending(false);
  }

  // ── Permission helpers ────────────────────────────────────────────────
  // (RLS enforces these server-side too — UI just hides disallowed buttons.)
  // Only Meteorologists can delete (any message or whole stacks). Citizens
  // and guests can read but cannot moderate.
  function canDelete(_msg: Message) {
    return isModerator;
  }
  function canDeleteStack(_stack: StackedReport) {
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
      await reloadMessages();
    } else {
      toast.success(ids.length === 1 ? "Report removed" : `${ids.length} reports removed`);
    }
  }

  async function joinReport(stack: StackedReport) {
    if (!user || !profile) return;
    // Embed the topic so the message groups into this stack via the
    // overlap-based matcher in reportGrouping.ts.
    const content = `${stack.topic} — ${profile.username} has joined the report.`.slice(
      0,
      MAX_MESSAGE_LENGTH,
    );
    const { error } = await supabase.from("messages").insert({
      user_id: user.id,
      username: profile.username,
      badge: profile.badge,
      content,
    });
    if (error) toast.error("Failed to join report");
  }

  async function approveStack(stack: StackedReport) {
    if (!user || !isModerator) return;
    // Optimistic
    setApprovedSigs((prev) => {
      const next = new Set(prev);
      next.add(stack.signature);
      return next;
    });
    const { error } = await supabase
      .from("report_approvals")
      .upsert({ signature: stack.signature, approved_by: user.id }, { onConflict: "signature" });
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
    const { error } = await supabase.from("report_approvals").delete().eq("signature", stack.signature);
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
        <h2 className="text-xs font-mono font-bold text-card-foreground uppercase flex items-center gap-2">
          <span className="size-1.5 bg-primary rounded-full animate-pulse" />
          Public Weather Reports
        </h3>
        <p className="text-[9px] font-mono text-muted-foreground mt-1 uppercase">2-hour rolling history</p>

        {/* Sort selector */}
        <div className="mt-2 flex gap-2">
          {(
            [
              { v: "default", label: "Priority" },
              { v: "newest", label: "Newest" },
              { v: "nearest", label: "Nearest" },
            ] as { v: SortMode; label: string }[]
          ).map(({ v, label }) => {
            const disabled = v === "nearest" && !canSortByLocation;
            const active = sortMode === v;
            return (
              <button
                key={v}
                type="button"
                disabled={disabled && v !== "nearest"}
                onClick={() => {
                  if (v === "nearest" && !canSortByLocation) {
                    setShowNearestDialog(true);
                  } else {
                    setSortMode(v);
                  }
                }}
                className={`flex-1 text-[9px] font-mono uppercase px-1.5 py-0.5 border rounded-sm transition-colors ${
                  active
                    ? "border-primary/60 text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                } ${disabled ? "opacity-40 cursor-not-allowed hover:border-border hover:text-muted-foreground" : ""}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stacked reports */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {/* Pinned automated bot messages (e.g. SPC outlook updates). */}
        {systemMessages.map((sys) => (
          <SystemMessageCard key={sys.id} message={sys} expandedKey={expanded} toggle={toggleExpand} />
        ))}

        {/* Loading placeholder while the SPC bot reverse-geocodes a fresh
            outlook. Keep it visible even if an older valid outlook card is
            still pinned below so users can tell the bot is actively refreshing. */}
        {spcLoading && (
          <div
            className="rounded border px-3 py-2 font-mono text-[11px]"
            style={{
              background: "rgba(255, 165, 0, 0.08)",
              borderColor: "rgba(255, 165, 0, 0.3)",
              color: "#ffa500",
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[9px] uppercase tracking-wide opacity-80">
                SPC Bot · System
              </span>
              <span className="size-1.5 bg-primary rounded-full animate-pulse" />
            </div>
            <p className="opacity-90">
              {systemMessages.length > 0
                ? "Refreshing SPC Day 1 Outlook and resolving updated counties…"
                : "Fetching latest SPC Day 1 Outlook and resolving affected counties…"}
            </p>
          </div>
        )}

        {stacks.length === 0 && systemMessages.length === 0 && !spcLoading ? (
          <p className="text-[10px] font-mono text-muted-foreground italic text-center pt-4">
            No reports yet. Be the first to report an event.
          </p>
        ) : (
          sortedStacks.map((stack) => {
            const isOpen = expanded.has(stack.id);
            const soloReport = stack.reports[0];
            const isSolo = stack.count === 1;
            const showSoloDelete = isSolo && canDelete(soloReport);
            const showStackDelete = !isSolo && canDeleteStack(stack);
                const isGeneral = stack.signature === "__general__";
                const showApprove = isModerator && !stack.approved && !isGeneral;
                const showUnapprove = isModerator && stack.approved && !isGeneral;
            return (
              <div
                key={stack.id}
                className={`bg-shroud border ${
                  stack.approved ? "border-neon-green/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.05)]" : "border-border"
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
                      <span className="text-[9px] font-mono text-muted-foreground">{isOpen ? "▾" : "▸"}</span>
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-foreground/90 leading-snug break-words whitespace-pre-wrap">
                    {stack.topic}
                  </p>
                  {(() => {
                    const latest = isGeneral
                      ? stack.reports[0]
                      : stack.reports[stack.reports.length - 1];
                    if (!latest) return null;
                    if (!isGeneral && latest.content === stack.topic) return null;
                    return (
                      <div className="pt-1 pl-2 border-l border-primary/30">
                        <p className="text-[8px] font-mono text-muted-foreground uppercase tracking-wide mb-0.5">
                          Latest · {latest.username}
                        </p>
                        <p className="text-[10px] font-mono text-foreground/70 leading-snug break-words whitespace-pre-wrap line-clamp-2">
                          {latest.content}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Join Report — signed-in users only, once per stack */}
                  {user && !isGeneral && (() => {
                    const alreadyJoined = stack.reports.some(
                      (r) => r.user_id === user.id && /has joined the report/i.test(r.content),
                    );
                    return (
                      <div className="flex justify-center pt-1" onClick={(e) => e.stopPropagation()}>
                        {alreadyJoined ? (
                          <span className="text-[9px] font-mono uppercase tracking-wide px-2 py-0.5 border border-neon-green/30 text-neon-green/80 bg-neon-green/5 rounded">
                            ✓ Joined
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => joinReport(stack)}
                            className="text-[9px] font-mono uppercase font-bold px-3 py-0.5 border border-primary/40 text-primary hover:bg-primary/10 rounded transition-colors"
                          >
                            Join Report
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Action row (approve / delete) */}
                  {(showApprove || showUnapprove || showSoloDelete || showStackDelete) && (
                    <div className="flex items-center gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
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

      {/* Structured composer — three upward dropdowns */}
      <div className="p-3 border-t border-border bg-shroud/30">
        {user && profile ? (
          <ComposerDropdowns
            phenomenon={phenomenon}
            relation={relation}
            placeLabel={placeLabel}
            placeQuery={placeQuery}
            placeResults={placeResults}
            placeLoading={placeLoading}
            sending={sending}
            onPickPhenomenon={(v) => setPhenomenon(v)}
            onPickRelation={(v) => setRelation(v)}
            onPickPlace={(v) => {
              setPlaceLabel(v);
              setPlaceQuery("");
            }}
            onChangePlaceQuery={setPlaceQuery}
            onSend={sendReport}
            onReset={resetComposer}
          />
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

      {/* Nearest sort unavailable dialog */}
      <AlertDialog open={showNearestDialog} onOpenChange={(o) => !o && setShowNearestDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Location sorting unavailable</AlertDialogTitle>
            <AlertDialogDescription>
              Please sign in and set a home town in the Account Center to sort reports by distance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowNearestDialog(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

/* ── Upward-opening dropdown composer ───────────────────────────────── */

type MenuKey = "phenom" | "rel" | "place" | null;

interface ComposerProps {
  phenomenon: string | null;
  relation: Relation | null;
  placeLabel: string | null;
  placeQuery: string;
  placeResults: GeocodedCity[];
  placeLoading: boolean;
  sending: boolean;
  onPickPhenomenon: (v: string) => void;
  onPickRelation: (v: Relation) => void;
  onPickPlace: (v: string) => void;
  onChangePlaceQuery: (v: string) => void;
  onSend: () => void;
  onReset: () => void;
}

function ComposerDropdowns({
  phenomenon,
  relation,
  placeLabel,
  placeQuery,
  placeResults,
  placeLoading,
  sending,
  onPickPhenomenon,
  onPickRelation,
  onPickPlace,
  onChangePlaceQuery,
  onSend,
  onReset,
}: ComposerProps) {
  const [open, setOpen] = useState<MenuKey>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const canSend = !!phenomenon && !!relation && !!placeLabel && !sending;
  const hasAny = !!phenomenon || !!relation || !!placeLabel;

  const triggerCls = (active: boolean, filled: boolean) =>
    `w-full flex items-center justify-between gap-1 px-2 py-1.5 text-[10px] font-mono border rounded-sm transition-colors min-w-0 ${
      active
        ? "border-primary/60 text-primary bg-primary/5"
        : filled
          ? "border-border text-foreground bg-background/40 hover:border-primary/40"
          : "border-border text-muted-foreground bg-background/40 hover:border-primary/40 hover:text-foreground"
    }`;

  const panelCls =
    "absolute z-30 left-0 right-0 bottom-full mb-1 max-h-56 overflow-y-auto bg-cockpit border border-border rounded-sm shadow-lg";

  return (
    <div ref={rootRef} className="space-y-2">
      {/* Button row wrapper — panels are absolutely positioned above this */}
      <div className="relative">
        {/* ── Full-width upward panels ── */}
        {open === "phenom" && (
          <ul className={panelCls}>
            {PHENOMENA.map((p) => (
              <li key={p.value}>
                <button
                  type="button"
                  onClick={() => {
                    onPickPhenomenon(p.value);
                    setOpen("rel");
                  }}
                  className={`w-full text-left px-2 py-1.5 text-[11px] font-mono hover:bg-primary/10 hover:text-primary transition-colors ${
                    phenomenon === p.value ? "text-primary" : "text-card-foreground"
                  }`}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        {open === "rel" && (
          <ul className={panelCls}>
            {RELATIONS.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  onClick={() => {
                    onPickRelation(r);
                    setOpen("place");
                  }}
                  className={`w-full text-left px-2 py-1.5 text-[11px] font-mono hover:bg-primary/10 hover:text-primary transition-colors ${
                    relation === r ? "text-primary" : "text-card-foreground"
                  }`}
                >
                  {r}
                </button>
              </li>
            ))}
          </ul>
        )}

        {open === "place" && (
          <div className={panelCls}>
            <div className="sticky top-0 bg-cockpit border-b border-border p-1.5">
              <div className="relative">
                <input
                  type="text"
                  value={placeQuery}
                  onChange={(e) => onChangePlaceQuery(e.target.value)}
                  placeholder="Search a US city..."
                  maxLength={80}
                  autoFocus
                  className="w-full bg-background/50 border border-border px-2 py-1 text-[11px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 rounded-sm"
                />
                {placeLoading && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3 animate-spin text-primary" />
                )}
              </div>
            </div>
            <ul>
              {placeQuery.trim().length < 2 ? (
                <li className="px-2 py-2 text-[10px] font-mono text-muted-foreground italic">
                  Type at least 2 characters…
                </li>
              ) : placeResults.length === 0 && !placeLoading ? (
                <li className="px-2 py-2 text-[10px] font-mono text-muted-foreground italic">
                  No matches.
                </li>
              ) : (
                placeResults.map((r) => {
                  const label = r.admin1 ? `${r.name}, ${r.admin1}` : r.name;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onPickPlace(label);
                          setOpen(null);
                        }}
                        className="w-full text-left px-2 py-1.5 text-[11px] font-mono text-card-foreground hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
                      >
                        <MapPin className="size-3 text-muted-foreground" />
                        {label}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}

        {/* ── Trigger buttons ── */}
        <div className="grid grid-cols-[1.1fr_0.9fr_1.3fr_auto] gap-1.5">
          {/* Phenomenon */}
          <button
            type="button"
            onClick={() => setOpen(open === "phenom" ? null : "phenom")}
            className={triggerCls(open === "phenom", !!phenomenon)}
          >
            <span className="truncate">{phenomenon ?? "Phenomenon"}</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </button>

          {/* Relation */}
          <button
            type="button"
            disabled={!phenomenon}
            onClick={() => setOpen(open === "rel" ? null : "rel")}
            className={`${triggerCls(open === "rel", !!relation)} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <span className="truncate">{relation ?? "Relation"}</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </button>

          {/* Place */}
          <button
            type="button"
            disabled={!relation}
            onClick={() => setOpen(open === "place" ? null : "place")}
            className={`${triggerCls(open === "place", !!placeLabel)} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <span className="truncate flex items-center gap-1">
              {placeLabel && <MapPin className="size-3 shrink-0 opacity-70" />}
              <span className="truncate">{placeLabel ?? "Place"}</span>
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </button>

          {/* Send */}
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className="px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary font-mono text-[10px] uppercase font-bold hover:bg-primary hover:text-background transition-all rounded-sm disabled:opacity-40 disabled:hover:bg-primary/10 disabled:hover:text-primary"
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
      </div>

      {hasAny && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-mono text-muted-foreground truncate">
            {phenomenon ?? "—"} {relation ?? "—"} {placeLabel ?? "—"}
          </p>
          <button
            type="button"
            onClick={onReset}
            disabled={sending}
            className="flex items-center gap-1 text-[9px] font-mono uppercase text-muted-foreground hover:text-destructive transition-colors"
          >
            <XIcon className="size-3" /> Reset
          </button>
        </div>
      )}
    </div>
  );
}
