/**
 * NotificationBell - shared inbox popover for desktop status bar and mobile
 * header. Shows unread count, recent notifications, and a quick toggle for
 * browser push.
 */
import { Bell, BellOff, BellRing, Check, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const SEVERITY_COLOR: Record<string, string> = {
  Extreme: "hsl(0 100% 60%)",
  Severe: "hsl(28 100% 55%)",
  Moderate: "hsl(48 100% 55%)",
  Minor: "hsl(190 100% 55%)",
};

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default function NotificationBell({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items, unread, markAllRead, clearAll } = useNotifications();
  const push = usePushRegistration();

  if (!user) return null;

  return (
    <Popover onOpenChange={(open) => { if (!open && unread) void markAllRead(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          className={cn(
            "relative flex items-center justify-center rounded-sm border transition-colors",
            compact ? "h-6 w-6" : "h-7 w-7",
            unread
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border bg-transparent text-muted-foreground hover:text-card-foreground",
          )}
        >
          {unread ? <BellRing className="size-3.5" /> : <Bell className="size-3.5" />}
          {unread > 0 && (
            <span
              className="absolute -right-1 -top-1 min-w-[14px] rounded-full px-1 text-[9px] font-mono font-bold leading-[14px] text-black"
              style={{ background: "#ff9d00", boxShadow: "0 0 6px rgba(255,157,0,0.8)" }}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 z-[1400] glass-panel">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
            Notifications
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => (push.subscribed ? void push.disable() : void push.enable())}
              disabled={!push.supported || push.busy || push.status === "denied"}
              title={
                !push.supported
                  ? "Browser push not supported"
                  : push.status === "denied"
                    ? "Browser notifications are blocked"
                    : push.subscribed
                      ? "Turn off browser push"
                      : "Turn on browser push"
              }
              className="rounded p-1 text-muted-foreground hover:text-primary disabled:opacity-40"
            >
              {push.subscribed ? <BellRing className="size-3.5" /> : <BellOff className="size-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => void markAllRead()}
              title="Mark all read"
              className="rounded p-1 text-muted-foreground hover:text-primary"
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void clearAll()}
              title="Clear all"
              className="rounded p-1 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center font-mono text-[10px] text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className="border-b border-border/60 px-3 py-2 last:border-b-0"
                style={{
                  borderLeft: `3px solid ${SEVERITY_COLOR[n.severity ?? ""] ?? "rgba(255,255,255,0.15)"}`,
                  background: n.read ? "transparent" : "rgba(255,157,0,0.06)",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-card-foreground">
                    {n.title}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                    {timeAgo(n.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{n.body}</p>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate("/account#notification-settings")}
          className="flex w-full items-center justify-center gap-1.5 border-t border-border px-3 py-2 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
        >
          <Settings className="size-3" />
          Notification settings
        </button>

      </PopoverContent>
    </Popover>
  );
}
