/**
 * LeftSidePanel — desktop left drawer content.
 *
 * Two collapsible sections stacked vertically:
 *   1. Bot Messages — latest SPC / Hurricane system messages (was pinned
 *      in CitizenReports). Renders via SystemMessageCard.
 *   2. Professional Weather Reports — the existing LSR feed (IntegrationPanel).
 *
 * Each section can be folded independently; both default open. Sections
 * scroll inside themselves so neither one starves the other for vertical
 * space inside the 280px drawer.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Bot, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SystemMessageCard } from "@/components/SystemMessageCard";
import { useSPCOutlookLoading } from "@/hooks/useSPCOutlook";
import IntegrationPanel from "@/components/IntegrationPanel";
import CurrentLocationHazards from "@/components/CurrentLocationHazards";
import { useAuth } from "@/hooks/useAuth";
import { useHomeCityRisk } from "@/hooks/useHomeCityRisk";
import { useWarningPolygons } from "@/hooks/useWarningPolygons";
import { pointInPolygon } from "@/lib/pointInPolygon";
import type { RawMessage } from "@/lib/reportGrouping";


type BotMessage = RawMessage;

function useBotMessages() {
  const [messages, setMessages] = useState<BotMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id,user_id,username,badge,content,created_at")
        .eq("badge", "System")
        .order("created_at", { ascending: false })
        .limit(10);
      if (cancelled || !data) return;
      setMessages(data as BotMessage[]);
    };
    void load();

    const ch = supabase
      .channel(`left-bot-messages_${Math.random().toString(36).slice(2)}_${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as BotMessage;
          if (row.badge !== "System") return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [row, ...prev].slice(0, 10);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          const id = (payload.old as { id: string }).id;
          setMessages((prev) => prev.filter((m) => m.id !== id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, []);

  // Dedupe by (user_id + issue marker), keeping newest per bot/issue. Then
  // enforce a fixed display order so the bots don't shuffle by recency:
  // SPC → Fire → Hurricane → anything else.
  const BOT_PRIORITY: Record<string, number> = {
    "00000000-0000-0000-0000-000000000000": 0, // SPC
    "00000000-0000-0000-0000-000000000002": 1, // Fire
    "00000000-0000-0000-0000-000000000001": 2, // Hurricane
  };
  return useMemo(() => {
    const seen = new Set<string>();
    const out: BotMessage[] = [];
    for (const m of messages) {
      const issueMatch = m.content.match(/<!--issue:(\d{12})-->/);
      const key = `${m.user_id}::${issueMatch ? issueMatch[1] : "noissue"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    out.sort((a, b) => {
      const pa = BOT_PRIORITY[a.user_id] ?? 99;
      const pb = BOT_PRIORITY[b.user_id] ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return out;
  }, [messages]);
}

function SectionHeader({
  title,
  open,
  onToggle,
  icon,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-1.5 border-b-2 border-primary bg-primary/5 px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors"
    >
      <span className="flex items-center gap-1.5">
        {icon}
        {title}
      </span>
      {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
    </button>
  );
}

export default function LeftSidePanel() {
  const botMessages = useBotMessages();
  const spcLoading = useSPCOutlookLoading();
  const { profile } = useAuth();
  const homeRisk = useHomeCityRisk(profile?.location ?? null);
  const { polygons } = useWarningPolygons();
  const [hazardsOpen, setHazardsOpen] = useState(true);
  const [botOpen, setBotOpen] = useState(true);
  const [reportsOpen, setReportsOpen] = useState(true);
  const [expandedKey, setExpandedKey] = useState<Set<string>>(new Set());

  const toggleKey = (id: string) =>
    setExpandedKey((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const showHazards = !!homeRisk.coords;

  return (
    <div className="flex h-full flex-col">
      {/* ── Current Location Hazards section ─────────────────────────── */}
      {showHazards && (
        <div className="shrink-0 flex flex-col border-b border-border">
          <SectionHeader
            title="Current Hazards"
            open={hazardsOpen}
            onToggle={() => setHazardsOpen((v) => !v)}
            icon={<AlertTriangle className="size-3" />}
          />
          {hazardsOpen && (
            <div className="max-h-[40vh] overflow-y-auto p-3">
              <CurrentLocationHazards
                polygons={polygons}
                coords={homeRisk.coords}
                cityLabel={profile?.location ?? null}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Bot Messages section ─────────────────────────────────────── */}

      <div className={`flex flex-col ${botOpen ? "flex-1 min-h-0" : "shrink-0"}`}>
        <SectionHeader
          title="Bot Messages"
          open={botOpen}
          onToggle={() => setBotOpen((v) => !v)}
          icon={<Bot className="size-3" />}
        />
        {botOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
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
                  {botMessages.length > 0
                    ? "Refreshing SPC Day 1 Outlook and resolving updated counties…"
                    : "Fetching latest SPC Day 1 Outlook and resolving affected counties…"}
                </p>
              </div>
            )}
            {botMessages.length === 0 && !spcLoading ? (
              <p className="text-[10px] font-mono text-muted-foreground italic text-center pt-4">
                No bot messages yet.
              </p>
            ) : (
              botMessages.map((m) => (
                <SystemMessageCard
                  key={m.id}
                  message={m}
                  expandedKey={expandedKey}
                  toggle={toggleKey}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Professional Weather Reports section ─────────────────────── */}
      <div className={`flex flex-col border-t border-border ${reportsOpen ? "flex-1 min-h-0" : "shrink-0"}`}>
        <SectionHeader
          title="Pro Weather Reports"
          open={reportsOpen}
          onToggle={() => setReportsOpen((v) => !v)}
        />
        {reportsOpen && (
          <div className="flex-1 min-h-0 overflow-hidden">
            {/* IntegrationPanel renders its own header — hide it via a
                sibling-aware wrapper. Simpler: render only its body by
                using IntegrationPanel directly; the existing header is
                tolerable but redundant. We hide it with CSS. */}
            <div className="h-full [&>div>h2]:hidden flex flex-col">
              <IntegrationPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
