/**
 * NotificationSettings - full notification controls for the Account Center.
 * Covers the browser-push device toggle, per-category switches, the WRS swing
 * threshold, and quiet hours. Preferences live in `notification_prefs`.
 */
import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { Switch } from "@/components/ui/switch";

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

const RECAP_ACTIVITIES = [
  { key: "walk", label: "Walk" },
  { key: "run", label: "Run" },
  { key: "bike", label: "Bike" },
  { key: "hike", label: "Hike" },
  { key: "calisthenics", label: "Calisthenics" },
];

const TOGGLES: Array<{ key: keyof Prefs; label: string; hint: string }> = [
  { key: "alerts_new", label: "New weather alerts", hint: "Warnings, watches and advisories covering your hometown." },
  { key: "alerts_upgrade", label: "Severity upgrades", hint: "An active alert is raised to a higher severity." },
  { key: "wrs_swings", label: "Storm risk swings", hint: "Rapid rise or fall of the Weather Risk Score." },
  { key: "spc_outlook", label: "SPC outlook (Enhanced+)", hint: "Convective outlook at Enhanced risk or above." },
  { key: "fire_outlook", label: "Fire weather outlook", hint: "Elevated, Critical or Extreme fire weather days." },
  { key: "chat_messages", label: "Chat reports", hint: "New citizen reports posted in the live chat." },
];

const labelClass = "text-[10px] font-mono uppercase tracking-wider text-muted-foreground";

export default function NotificationSettings() {
  const { user, profile } = useAuth();
  const push = usePushRegistration();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("notification_prefs")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
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
    const { error } = await supabase.from("notification_prefs").upsert(
      {
        user_id: user.id,
        ...next,
        timezone: next.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) toast.error("Could not save notification settings");
  };

  if (!user) return null;

  return (
    <section className="glass-panel rounded-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-secondary/40">
        <Bell className="size-3.5 text-primary" />
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
          Notifications
        </span>
        {saving && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>

      <div className="p-5 space-y-4">
        {loading ? (
          <p className="text-[11px] font-mono text-muted-foreground">Loading preferences…</p>
        ) : (
          <>
            {!profile?.location && (
              <p className="rounded-sm border border-primary/30 bg-primary/5 p-3 text-[11px] text-primary">
                Set a hometown above - notifications are evaluated for that location.
              </p>
            )}

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[12px] font-semibold text-card-foreground">Enable notifications</div>
                <div className="text-[11px] text-muted-foreground">
                  Master switch for in-app and browser alerts.
                </div>
              </div>
              <Switch
                checked={prefs.enabled}
                onCheckedChange={(v) => void save({ ...prefs, enabled: v })}
              />
            </div>

            <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
              <div>
                <div className="text-[12px] font-semibold text-card-foreground">Browser push on this device</div>
                <div className="text-[11px] text-muted-foreground">
                  {!push.supported
                    ? "This browser does not support push notifications."
                    : push.status === "denied"
                      ? "Blocked in browser settings - allow notifications for this site first."
                      : push.subscribed
                        ? "This device receives push notifications."
                        : "Turn on to receive alerts when the tab is closed."}
                </div>
              </div>
              <Switch
                checked={push.subscribed}
                disabled={!push.supported || push.busy || push.status === "denied"}
                onCheckedChange={(v) => void (v ? push.enable() : push.disable())}
              />
            </div>

            <div className="space-y-3 pt-3 border-t border-border">
              {TOGGLES.map((t) => (
                <div key={t.key} className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[12px] font-semibold text-card-foreground">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground">{t.hint}</div>
                  </div>
                  <Switch
                    checked={Boolean(prefs[t.key])}
                    disabled={!prefs.enabled}
                    onCheckedChange={(v) => void save({ ...prefs, [t.key]: v })}
                  />
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-border">
              <span className={labelClass}>Chat report scope</span>
              <div className="mt-2 flex gap-2">
                {(["local", "all"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    disabled={!prefs.enabled || !prefs.chat_messages}
                    onClick={() => void save({ ...prefs, chat_scope: scope })}
                    className={`flex-1 rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors disabled:opacity-40 ${
                      prefs.chat_scope === scope
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {scope === "local" ? "Local" : "All"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Local sends only reports posted within 150 km of your hometown. All sends every new
                citizen report.
              </p>
            </div>

            <div className="pt-3 border-t border-border">
              <label className={labelClass} htmlFor="wrs-delta">
                Storm risk swing threshold: {prefs.wrs_delta} points / 30 min
              </label>
              <input
                id="wrs-delta"
                type="range"
                min={5}
                max={40}
                step={5}
                value={prefs.wrs_delta}
                disabled={!prefs.enabled || !prefs.wrs_swings}
                onChange={(e) => void save({ ...prefs, wrs_delta: Number(e.target.value) })}
                className="mt-2 w-full accent-primary"
              />
            </div>

            <div className="pt-3 border-t border-border space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[12px] font-semibold text-card-foreground">Tomorrow's weather recap</div>
                  <div className="text-[11px] text-muted-foreground">
                    Daily summary of tomorrow's real feel, wind, UV and rain for your hometown.
                  </div>
                </div>
                <Switch
                  checked={prefs.daily_recap}
                  disabled={!prefs.enabled}
                  onCheckedChange={(v) => void save({ ...prefs, daily_recap: v })}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="recap-hour">
                  Delivery time: {String(prefs.recap_hour).padStart(2, "0")}:00 local
                </label>
                <input
                  id="recap-hour"
                  type="range"
                  min={4}
                  max={11}
                  step={1}
                  value={prefs.recap_hour}
                  disabled={!prefs.enabled || !prefs.daily_recap}
                  onChange={(e) => void save({ ...prefs, recap_hour: Number(e.target.value) })}
                  className="mt-2 w-full accent-primary"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[12px] font-semibold text-card-foreground">Include best times to exercise</div>
                  <div className="text-[11px] text-muted-foreground">Adds the most comfortable 2-hour window per activity.</div>
                </div>
                <Switch
                  checked={prefs.recap_exercise}
                  disabled={!prefs.enabled || !prefs.daily_recap}
                  onCheckedChange={(v) => void save({ ...prefs, recap_exercise: v })}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {RECAP_ACTIVITIES.map((a) => {
                  const on = prefs.recap_activities.includes(a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      disabled={!prefs.enabled || !prefs.daily_recap || !prefs.recap_exercise}
                      onClick={() =>
                        void save({
                          ...prefs,
                          recap_activities: on
                            ? prefs.recap_activities.filter((x) => x !== a.key)
                            : [...prefs.recap_activities, a.key],
                        })
                      }
                      className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors disabled:opacity-40 ${
                        on
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>



            <div className="pt-3 border-t border-border">
              <span className={labelClass}>Quiet hours (local time)</span>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={prefs.quiet_start ?? ""}
                  onChange={(e) =>
                    void save({
                      ...prefs,
                      quiet_start: e.target.value === "" ? null : Number(e.target.value),
                      quiet_end: e.target.value === "" ? null : prefs.quiet_end ?? 7,
                    })
                  }
                  className="rounded-sm border border-border bg-background px-2 py-1 font-mono text-[11px]"
                >
                  <option value="">Off</option>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                  ))}
                </select>
                <span className="font-mono text-[11px] text-muted-foreground">to</span>
                <select
                  value={prefs.quiet_end ?? ""}
                  disabled={prefs.quiet_start == null}
                  onChange={(e) =>
                    void save({
                      ...prefs,
                      quiet_end: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="rounded-sm border border-border bg-background px-2 py-1 font-mono text-[11px] disabled:opacity-50"
                >
                  <option value="">Off</option>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Notifications are skipped during this window. Limits: one storm-risk alert per hour,
                ten notifications per hour.
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
