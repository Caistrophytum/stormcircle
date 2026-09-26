import { useEffect, useState, type ReactNode } from "react";
import { Bell, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface Prefs {
  enabled: boolean;
  alerts_new: boolean;
  alerts_upgrade: boolean;
  wrs_swings: boolean;
  spc_outlook: boolean;
  fire_outlook: boolean;
  chat_messages: boolean;
  chat_scope: "all" | "local";
  wrs_delta: number;
  quiet_start: number | null;
  quiet_end: number | null;
  timezone: string | null;
  daily_recap: boolean;
  recap_hour: number;
  recap_exercise: boolean;
  recap_activities: string[];
}

type GroupId = "delivery" | "weather" | "community" | "tomorrow" | "quiet";

const DEFAULTS: Prefs = {
  enabled: true,
  alerts_new: true,
  alerts_upgrade: true,
  wrs_swings: true,
  spc_outlook: true,
  fire_outlook: true,
  chat_messages: false,
  chat_scope: "local",
  wrs_delta: 15,
  quiet_start: null,
  quiet_end: null,
  timezone: null,
  daily_recap: false,
  recap_hour: 7,
  recap_exercise: false,
  recap_activities: [],
};

const WEATHER_TOGGLES: Array<{ key: keyof Prefs; label: string }> = [
  { key: "alerts_new", label: "New alerts" },
  { key: "alerts_upgrade", label: "Severity upgrades" },
  { key: "wrs_swings", label: "WRS changes" },
  { key: "spc_outlook", label: "SPC Enhanced+" },
  { key: "fire_outlook", label: "Fire outlooks" },
];

const RECAP_ACTIVITIES = [
  { key: "walk", label: "🚶 Walk" },
  { key: "run", label: "🏃 Run" },
  { key: "bike", label: "🚴 Bike" },
  { key: "hike", label: "🥾 Hike" },
  { key: "calisthenics", label: "🏋️ Calisthenics" },
];

const labelClass = "text-[10px] font-mono uppercase text-muted-foreground";

function ToggleRow({ label, checked, disabled, onChange }: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4">
      <span className="text-xs font-medium text-card-foreground">{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function SettingsGroup({ id, emoji, title, summary, open, onToggle, children }: {
  id: GroupId;
  emoji: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = `notification-group-${id}`;
  return (
    <div className={cn("overflow-hidden rounded-md border bg-secondary/65 transition-colors", open ? "border-primary/35" : "border-border")}>
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="h-auto min-h-16 w-full justify-between rounded-none px-3 py-3 text-left hover:bg-background/40"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="emoji-glyph flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-lg">{emoji}</span>
          <span className="min-w-0">
            <span className="block font-mono text-xs font-bold uppercase text-card-foreground">{title}</span>
            <span className="block truncate text-[10px] font-normal text-muted-foreground">{summary}</span>
          </span>
        </span>
        <ChevronDown className={cn("!size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180 text-primary")} />
      </Button>
      <div id={panelId} hidden={!open} className="border-t border-border px-4 py-3">
        {children}
      </div>
    </div>
  );
}

export default function NotificationSettings() {
  const { user, profile } = useAuth();
  const push = usePushRegistration();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openGroup, setOpenGroup] = useState<GroupId | null>("delivery");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("notification_prefs").select("*").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      if (data) setPrefs({ ...DEFAULTS, ...(data as unknown as Prefs) });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const save = async (next: Prefs) => {
    if (!user) return;
    setPrefs(next);
    setSaving(true);
    const { error } = await supabase.from("notification_prefs").upsert({
      user_id: user.id,
      ...next,
      timezone: next.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error("Could not save notification settings");
  };

  if (!user) return null;

  const toggleGroup = (id: GroupId) => setOpenGroup((current) => current === id ? null : id);
  const quietSummary = prefs.quiet_start == null
    ? "Off"
    : `${String(prefs.quiet_start).padStart(2, "0")}:00 to ${String(prefs.quiet_end ?? 7).padStart(2, "0")}:00`;

  return (
    <section className="glass-panel overflow-hidden rounded-md">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-5 py-3">
        <Bell className="size-3.5 text-primary" />
        <span className="font-mono text-[11px] font-bold uppercase text-primary">Notifications</span>
        {saving && <Loader2 aria-label="Saving" className="size-3 animate-spin text-muted-foreground" />}
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {loading ? (
          <p className="font-mono text-[11px] text-muted-foreground">Loading preferences...</p>
        ) : (
          <>
            {!profile?.location && (
              <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] text-primary">
                📍 Add a hometown for local alerts.
              </p>
            )}

            <SettingsGroup id="delivery" emoji="🔔" title="Delivery" summary={prefs.enabled ? (push.subscribed ? "On · Push ready" : "On · In-app only") : "Off"} open={openGroup === "delivery"} onToggle={() => toggleGroup("delivery")}>
              <div className="divide-y divide-border">
                <ToggleRow label="All notifications" checked={prefs.enabled} onChange={(value) => void save({ ...prefs, enabled: value })} />
                <ToggleRow label="Push on this device" checked={push.subscribed} disabled={!push.supported || push.busy || push.status === "denied"} onChange={(value) => void (value ? push.enable() : push.disable())} />
              </div>
              {!push.supported && <p className="mt-2 text-[10px] text-muted-foreground">Push is not supported here.</p>}
              {push.status === "denied" && <p className="mt-2 text-[10px] text-destructive">Allow notifications in your browser first.</p>}
            </SettingsGroup>

            <SettingsGroup id="weather" emoji="⚠️" title="Weather" summary={`${WEATHER_TOGGLES.filter((item) => Boolean(prefs[item.key])).length} of ${WEATHER_TOGGLES.length} alerts on`} open={openGroup === "weather"} onToggle={() => toggleGroup("weather")}>
              <div className="divide-y divide-border">
                {WEATHER_TOGGLES.map((item) => (
                  <ToggleRow key={item.key} label={item.label} checked={Boolean(prefs[item.key])} disabled={!prefs.enabled} onChange={(value) => void save({ ...prefs, [item.key]: value })} />
                ))}
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <label className={labelClass} htmlFor="wrs-delta">WRS change: {prefs.wrs_delta} points / 30 min</label>
                <input id="wrs-delta" type="range" min={5} max={40} step={5} value={prefs.wrs_delta} disabled={!prefs.enabled || !prefs.wrs_swings} onChange={(event) => void save({ ...prefs, wrs_delta: Number(event.target.value) })} className="mt-2 w-full accent-primary" />
              </div>
            </SettingsGroup>

            <SettingsGroup id="community" emoji="💬" title="Community" summary={prefs.chat_messages ? `${prefs.chat_scope === "local" ? "Local" : "All"} reports` : "Off"} open={openGroup === "community"} onToggle={() => toggleGroup("community")}>
              <ToggleRow label="Chat reports" checked={prefs.chat_messages} disabled={!prefs.enabled} onChange={(value) => void save({ ...prefs, chat_messages: value })} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["local", "all"] as const).map((scope) => (
                  <Button key={scope} type="button" variant="outline" disabled={!prefs.enabled || !prefs.chat_messages} onClick={() => void save({ ...prefs, chat_scope: scope })} className={cn("h-9 rounded-md font-mono text-[10px] uppercase", prefs.chat_scope === scope && "border-primary/60 bg-primary/10 text-primary")}>
                    {scope === "local" ? "📍 Local" : "🌐 All"}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">Local means within 150 km of home.</p>
            </SettingsGroup>

            <SettingsGroup id="tomorrow" emoji="🌤️" title="Tomorrow" summary={prefs.daily_recap ? `${String(prefs.recap_hour).padStart(2, "0")}:00${prefs.recap_exercise ? " · Exercise" : ""}` : "Recap off"} open={openGroup === "tomorrow"} onToggle={() => toggleGroup("tomorrow")}>
              <ToggleRow label="Daily recap" checked={prefs.daily_recap} disabled={!prefs.enabled} onChange={(value) => void save({ ...prefs, daily_recap: value })} />
              <div className="border-t border-border py-3">
                <label className={labelClass} htmlFor="recap-hour">Send at {String(prefs.recap_hour).padStart(2, "0")}:00</label>
                <input id="recap-hour" type="range" min={4} max={11} step={1} value={prefs.recap_hour} disabled={!prefs.enabled || !prefs.daily_recap} onChange={(event) => void save({ ...prefs, recap_hour: Number(event.target.value) })} className="mt-2 w-full accent-primary" />
                <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground"><span>4 AM</span><span>11 AM</span></div>
              </div>
              <ToggleRow label="Best exercise times" checked={prefs.recap_exercise} disabled={!prefs.enabled || !prefs.daily_recap} onChange={(value) => void save({ ...prefs, recap_exercise: value })} />
              <div className="mt-2 flex flex-wrap gap-2">
                {RECAP_ACTIVITIES.map((activity) => {
                  const selected = prefs.recap_activities.includes(activity.key);
                  return (
                    <Button key={activity.key} type="button" size="sm" variant="outline" disabled={!prefs.enabled || !prefs.daily_recap || !prefs.recap_exercise} onClick={() => void save({ ...prefs, recap_activities: selected ? prefs.recap_activities.filter((key) => key !== activity.key) : [...prefs.recap_activities, activity.key] })} className={cn("h-8 rounded-md px-2 font-mono text-[9px] uppercase", selected && "border-primary/60 bg-primary/10 text-primary")}>
                      {activity.label}
                    </Button>
                  );
                })}
              </div>
            </SettingsGroup>

            <SettingsGroup id="quiet" emoji="🌙" title="Quiet time" summary={quietSummary} open={openGroup === "quiet"} onToggle={() => toggleGroup("quiet")}>
              <div className="flex items-center gap-2">
                <select aria-label="Quiet time starts" value={prefs.quiet_start ?? ""} onChange={(event) => void save({ ...prefs, quiet_start: event.target.value === "" ? null : Number(event.target.value), quiet_end: event.target.value === "" ? null : prefs.quiet_end ?? 7 })} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-2 font-mono text-[11px]">
                  <option value="">Off</option>
                  {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
                </select>
                <span className="font-mono text-[10px] text-muted-foreground">to</span>
                <select aria-label="Quiet time ends" value={prefs.quiet_end ?? ""} disabled={prefs.quiet_start == null} onChange={(event) => void save({ ...prefs, quiet_end: event.target.value === "" ? null : Number(event.target.value) })} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-2 font-mono text-[11px] disabled:opacity-50">
                  <option value="">Off</option>
                  {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
                </select>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">No alerts in this window. Limit: 10 per hour.</p>
            </SettingsGroup>
          </>
        )}
      </div>
    </section>
  );
}