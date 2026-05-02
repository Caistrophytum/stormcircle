/**
 * AccountCenter.tsx — the signed-in user's "settings" page. Three sections:
 *
 *   1. Operator Profile — username/email/badge readout + Logout / Delete
 *   2. Meteorologist Badge — application form (only shown to Citizens who
 *      haven't applied yet) or "under review" status (after applying)
 *   3. Contact / Feedback — generic message form to stormcirclecontact@gmail.com
 *
 * Both forms (badge application and contact) share a 60-second cooldown so
 * a single user can't drain the EmailJS free-tier quota by spamming submits.
 *
 * The "delete account" flow requires the user to type their EXACT username
 * (case-sensitive) into the confirmation dialog before the destructive RPC
 * `delete_user` is invoked.
 */
import { useEffect, useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  LogOut,
  Trash2,
  CloudLightning,
  ShieldCheck,
  Send,
  Mail,
  User as UserIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sendEmail, TEMPLATE_IDS, isEmailJsConfigured } from "@/lib/emailjs";
import { changelog } from "@/data/changelog";
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

const inputClass =
  "w-full bg-cockpit/60 border border-border focus:border-primary/60 focus:outline-none rounded-sm px-3 py-2 text-sm font-mono text-card-foreground placeholder:text-muted-foreground/60 transition-colors disabled:opacity-60";
const labelClass = "text-[10px] font-mono uppercase tracking-wider text-muted-foreground";

const SectionHeader = ({ icon: Icon, label, hint }: { icon: typeof UserIcon; label: string; hint?: string }) => (
  <div className="border-b border-border bg-cockpit/80 px-5 py-3 flex items-center gap-2">
    <Icon className="size-4 text-primary" />
    <h2 className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-card-foreground">{label}</h2>
    {hint && <span className="ml-auto text-[9px] font-mono text-muted-foreground">{hint}</span>}
  </div>
);

const BadgeChip = ({ badge }: { badge: string }) => {
  if (badge === "Meteorologist") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 border border-neon-blue/30 bg-neon-blue/10 text-neon-blue rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider">
        <CloudLightning className="size-3" />
        Meteorologist
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 border border-border bg-secondary text-muted-foreground rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider">
      <UserIcon className="size-3" />
      Citizen
    </span>
  );
};

const subjectSchema = z.enum(["General Feedback", "Bug Report", "Feature Request", "Other"]);

const AccountCenter = () => {
  const navigate = useNavigate();
  const { user, profile, loading, signOut } = useAuth();

  // Redirect to /auth when not signed in
  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  // Delete-account dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Meteorologist application state
  const [appFirst, setAppFirst] = useState("");
  const [appLast, setAppLast] = useState("");
  const [appEmail, setAppEmail] = useState("");
  const [appDesc, setAppDesc] = useState("");
  const [submittingApp, setSubmittingApp] = useState(false);

  // Contact / feedback state
  const [contactSubject, setContactSubject] = useState<"General Feedback" | "Bug Report" | "Feature Request" | "Other">(
    "General Feedback",
  );
  const [contactMessage, setContactMessage] = useState("");
  const [sendingContact, setSendingContact] = useState(false);

  // Shared 60s cooldown between any email send (applies to BOTH the
  // meteorologist application and the contact form) so the EmailJS quota
  // can't be drained by a single user spamming submits.
  const EMAIL_COOLDOWN_SECONDS = 60;
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const t = setTimeout(() => setCooldownRemaining((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldownRemaining]);

  const startCooldown = () => setCooldownRemaining(EMAIL_COOLDOWN_SECONDS);

  useEffect(() => {
    if (profile?.email && !appEmail) setAppEmail(profile.email);
  }, [profile, appEmail]);

  if (loading || !user || !profile) {
    return (
      <main className="min-h-screen w-full bg-background flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </main>
    );
  }

  /** Sign the user out and bounce them to the auth page. */
  const handleLogout = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  /**
   * Permanently deletes the account.
   *   1. Verify the typed username matches EXACTLY (case-sensitive)
   *   2. Best-effort delete of the profiles row (ON DELETE CASCADE on
   *      auth.users → profiles also handles this, but doing it explicitly
   *      avoids a momentary stale row in case the cascade is delayed)
   *   3. Call the SECURITY DEFINER `delete_user` RPC, which removes the
   *      row from auth.users (the user can't do that directly via RLS)
   *   4. Sign out and redirect to /auth
   */
  const handleDelete = async () => {
    if (deleteConfirmText !== profile.username) {
      toast.error("Username does not match");
      return;
    }
    setDeleting(true);
    try {
      // Best-effort profile cleanup; cascade should also handle this.
      await supabase.from("profiles").delete().eq("id", user.id);
      const { error } = await supabase.rpc("delete_user");
      if (error) {
        toast.error(`Could not delete account: ${error.message}`);
        return;
      }
      await supabase.auth.signOut();
      toast.success("Account deleted");
      navigate("/auth", { replace: true });
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  /**
   * Submits a Meteorologist badge application:
   *   1. Validate inputs (length limits enforced both here AND via maxLength
   *      on the inputs themselves)
   *   2. Respect the shared 60s email cooldown
   *   3. Try to send the EmailJS notification (best effort — we still mark
   *      the application as submitted even if email fails)
   *   4. Flip `meteorologist_applied` to true on the profile row. The
   *      database trigger `prevent_meteorologist_reapply` makes sure the
   *      user cannot flip it back later or change their badge themselves.
   */
  const handleApplication = async (e: FormEvent) => {
    e.preventDefault();
    const first = appFirst.trim();
    const last = appLast.trim();
    const email = appEmail.trim();
    const desc = appDesc.trim();

    if (!first || !last) return toast.error("First and last name are required");
    const emailParsed = z.string().email().max(255).safeParse(email);
    if (!emailParsed.success) return toast.error("Invalid email address");
    if (desc.length < 50) return toast.error("Description must be at least 50 characters");
    if (desc.length > 1000) return toast.error("Description must be 1000 characters or less");

    if (cooldownRemaining > 0) {
      return toast.error(`Please wait ${cooldownRemaining}s before sending another email`);
    }

    setSubmittingApp(true);
    try {
      let emailSent = false;
      let emailError: string | null = null;

      if (isEmailJsConfigured()) {
        try {
          await sendEmail(TEMPLATE_IDS.meteorologistApplication, {
            subject: `Meteorologist Badge Application — ${profile.username}`,
            from_email: email,
            reply_to: email,
            name: `${first} ${last}`,
            first_name: first,
            last_name: last,
            username: profile.username,
            description: desc,
          });
          emailSent = true;
        } catch (err) {
          emailError = err instanceof Error ? err.message : "Email delivery failed";
        }
      }

      // Always record the application in the database so the UI reflects it.
      const { error } = await supabase.from("profiles").update({ meteorologist_applied: true }).eq("id", user.id);
      if (error) {
        toast.error(`Could not save application: ${error.message}`);
        return;
      }

      if (emailSent) {
        startCooldown();
        toast.success("Application submitted — we'll be in touch");
      } else if (emailError) {
        toast.warning(`Application saved, but email failed: ${emailError}`);
      } else {
        toast.success("Application saved. (Email delivery is not configured yet.)");
      }
    } finally {
      setSubmittingApp(false);
    }
  };

  /**
   * Sends a contact-form / feedback message via EmailJS. Same length
   * limits, sanitization, and 60s cooldown as the application flow.
   */
  const handleContact = async (e: FormEvent) => {
    e.preventDefault();
    const message = contactMessage.trim();
    if (message.length < 5) return toast.error("Message is too short");
    if (message.length > 500) return toast.error("Message is too long (max 500)");
    const subjectParsed = subjectSchema.safeParse(contactSubject);
    if (!subjectParsed.success) return toast.error("Invalid subject");

    if (!isEmailJsConfigured()) {
      toast.error("Email is not configured yet — message could not be sent.");
      return;
    }

    if (cooldownRemaining > 0) {
      return toast.error(`Please wait ${cooldownRemaining}s before sending another email`);
    }

    setSendingContact(true);
    try {
      await sendEmail(TEMPLATE_IDS.contactFeedback, {
        subject: `${subjectParsed.data} from ${profile.username}`,
        from_email: profile.email,
        reply_to: profile.email,
        username: profile.username,
        message,
        category: subjectParsed.data,
      });
      startCooldown();
      toast.success("Message sent");
      setContactMessage("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      toast.error(msg);
    } finally {
      setSendingContact(false);
    }
  };

  const showApplication = profile.badge === "Citizen" && !profile.meteorologist_applied;
  const showUnderReview = profile.badge === "Citizen" && profile.meteorologist_applied;

  return (
    <main className="min-h-screen w-full bg-background py-8 px-4 md:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-card-foreground transition-colors"
        >
          <ArrowLeft className="size-3" />
          Back to Deck
        </Link>

        <header>
          <h1 className="text-xl font-mono font-bold uppercase tracking-[0.2em] text-card-foreground">
            Account Center
          </h1>
          <p className="text-[11px] font-mono text-muted-foreground mt-1">
            Manage your operator profile, badge status, and communications.
          </p>
        </header>

        {/* SECTION 1 — Profile */}
        <section className="glass-panel rounded-sm overflow-hidden">
          <SectionHeader icon={UserIcon} label="Operator Profile" hint="STRATO.OPS" />
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className={labelClass}>Username</div>
                <div className="text-sm font-mono text-card-foreground mt-1">{profile.username}</div>
              </div>
              <div>
                <div className={labelClass}>Email</div>
                <div className="text-sm font-mono text-card-foreground mt-1 break-all">{profile.email}</div>
              </div>
              <div>
                <div className={labelClass}>Badge</div>
                <div className="mt-1">
                  <BadgeChip badge={profile.badge} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary text-card-foreground hover:brightness-110 transition-all rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider"
              >
                <LogOut className="size-3" />
                Logout
              </button>
              <button
                onClick={() => {
                  setDeleteConfirmText("");
                  setDeleteOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition-all rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider"
              >
                <Trash2 className="size-3" />
                Delete Account
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 2 — Meteorologist application */}
        {(showApplication || showUnderReview) && (
          <section className="glass-panel rounded-sm overflow-hidden">
            <SectionHeader icon={ShieldCheck} label="Meteorologist Badge" />
            <div className="p-5">
              {showUnderReview ? (
                <div className="flex items-center gap-3 p-4 border border-neon-blue/30 bg-neon-blue/5 rounded-sm">
                  <CloudLightning className="size-4 text-neon-blue" />
                  <p className="text-xs font-mono text-card-foreground">Your application is under review.</p>
                </div>
              ) : (
                <form onSubmit={handleApplication} className="space-y-4">
                  <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                    Apply for the Meteorologist badge. Tell us about your background — minimum 50 characters.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className={labelClass} htmlFor="app-first">
                        First Name
                      </label>
                      <input
                        id="app-first"
                        value={appFirst}
                        onChange={(e) => setAppFirst(e.target.value)}
                        className={inputClass}
                        maxLength={64}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClass} htmlFor="app-last">
                        Last Name
                      </label>
                      <input
                        id="app-last"
                        value={appLast}
                        onChange={(e) => setAppLast(e.target.value)}
                        className={inputClass}
                        maxLength={64}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="app-email">
                      Email Address
                    </label>
                    <input
                      id="app-email"
                      type="email"
                      value={appEmail}
                      onChange={(e) => setAppEmail(e.target.value)}
                      className={inputClass}
                      maxLength={255}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="app-desc">
                      Self-description ({appDesc.trim().length}/1000, min 50)
                    </label>
                    <textarea
                      id="app-desc"
                      value={appDesc}
                      onChange={(e) => setAppDesc(e.target.value)}
                      className={`${inputClass} min-h-[120px] resize-y`}
                      placeholder="Background, credentials, forecasting experience..."
                      maxLength={1000}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submittingApp || cooldownRemaining > 0}
                    className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono text-[11px] font-bold uppercase tracking-wider px-4 py-2.5 rounded-sm hover:brightness-110 transition-all neon-glow-amber disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submittingApp ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    {cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : "Submit Application"}
                  </button>
                </form>
              )}
            </div>
          </section>
        )}

        {/* SECTION 3 — Contact / Feedback */}
        <section className="glass-panel rounded-sm overflow-hidden">
          <SectionHeader icon={Mail} label="Contact / Feedback" />
          <div className="p-5">
            <form onSubmit={handleContact} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Email (auto)</label>
                  <input value={profile.email} readOnly disabled className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Username (auto)</label>
                  <input value={profile.username} readOnly disabled className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="contact-subject">
                  Subject
                </label>
                <select
                  id="contact-subject"
                  value={contactSubject}
                  onChange={(e) => setContactSubject(e.target.value as typeof contactSubject)}
                  className={inputClass}
                >
                  <option value="General Feedback">General Feedback</option>
                  <option value="Bug Report">Bug Report</option>
                  <option value="Feature Request">Feature Request</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="contact-message">
                  Message ({contactMessage.trim().length}/500)
                </label>
                <textarea
                  id="contact-message"
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  className={`${inputClass} min-h-[120px] resize-y`}
                  placeholder="What's on your mind?"
                  maxLength={500}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={sendingContact || cooldownRemaining > 0}
                className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono text-[11px] font-bold uppercase tracking-wider px-4 py-2.5 rounded-sm hover:brightness-110 transition-all neon-glow-amber disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sendingContact ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : "Send Message"}
              </button>
            </form>
          </div>
        </section>

        {/* SECTION 4 — Recent Updates / Changelog */}
        <section className="glass-panel rounded-sm overflow-hidden">
          <SectionHeader icon={Sparkles} label="Recent Updates" hint="What's new on StormCircle™, 04/26" />
          <div className="p-5">
            <ol className="relative border-l border-border/60 ml-2 space-y-5">
              {changelog.map((entry) => {
                const tagColor =
                  entry.tag === "NEW"
                    ? "bg-neon-blue/10 text-neon-blue border-neon-blue/20"
                    : entry.tag === "FIXED"
                      ? "bg-destructive/10 text-destructive border-destructive/20"
                      : "bg-primary/10 text-primary border-primary/20";
                return (
                  <li key={entry.date + entry.title} className="ml-4">
                    <div className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary border border-background" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 border rounded-sm text-[9px] font-mono font-bold uppercase tracking-wider ${tagColor}`}
                      >
                        {entry.tag}
                      </span>
                      <time className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        {entry.date}
                      </time>
                    </div>
                    <h3 className="mt-1 text-sm font-mono font-semibold text-card-foreground">{entry.title}</h3>
                    <p className="mt-0.5 text-xs font-mono text-muted-foreground leading-relaxed">{entry.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono uppercase tracking-wider">Delete account</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs">
              This permanently deletes your account, profile, and access. To confirm, type your username{" "}
              <span className="text-card-foreground font-bold">{profile.username}</span> below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            className={inputClass}
            placeholder={profile.username}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting || deleteConfirmText !== profile.username}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Trash2 className="size-3.5 mr-1.5" />}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default AccountCenter;
