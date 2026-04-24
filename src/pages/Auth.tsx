/**
 * Auth.tsx — single page that hosts four auth flows behind a tabbed UI:
 *   • login   — sign in with email OR username + password
 *   • signup  — create account (with honeypot anti-bot field)
 *   • forgot  — request a password reset email
 *   • resend  — re-request the signup confirmation email
 *
 * Security hardening already applied here:
 *   • Honeypot field on signup silently rejects bots
 *   • Login errors are always the same generic "Invalid credentials" so
 *     attackers can't enumerate which emails/usernames exist
 *   • Password schema enforces ≥8 chars, ≥1 uppercase, ≥1 number
 *   • Username schema only allows [a-zA-Z0-9_] which prevents HTML/SQL
 *     injection at the validation layer
 *   • All redirects after successful auth use hardcoded relative paths
 *     (no open-redirect vector via query params)
 */
import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, UserPlus, KeyRound, Loader2, ArrowLeft, MailCheck } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Builds the URL Supabase should redirect users to after they click an
 * email confirmation / password-reset link.
 *
 * When developing on localhost the redirect would land on a URL the
 * Supabase project doesn't allow, so we hard-fall-back to the preview URL.
 * In every other environment we use the current origin.
 */
const getAuthRedirectUrl = () => {
  if (typeof window === "undefined") return "/";

  const { origin, hostname } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "https://id-preview--bce5fa05-5c8e-4487-b852-7382c0d3ff7e.lovable.app/";
  }

  return `${origin}/`;
};

/** Which form is currently being shown. */
type View = "login" | "signup" | "forgot" | "resend";

// --- Validation schemas (zod) -------------------------------------------------
// All user input runs through these BEFORE we touch Supabase. They double as
// the source of truth for our error messages.
const emailSchema = z.string().trim().email({ message: "Invalid email address" }).max(255);
const usernameSchema = z
  .string()
  .trim()
  .min(3, { message: "Username must be at least 3 characters" })
  .max(32, { message: "Username must be 32 characters or less" })
  // Restricting the alphabet here means usernames can never contain HTML
  // tags, quotes, semicolons, etc. — a free input-sanitization layer.
  .regex(/^[a-zA-Z0-9_]+$/, { message: "Username may only contain letters, numbers, and underscores" });
const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters" })
  .max(128, { message: "Password must be 128 characters or less" })
  .regex(/[A-Z]/, { message: "Password must contain at least 1 uppercase letter" })
  .regex(/[0-9]/, { message: "Password must contain at least 1 number" });

// Same string for every login failure so we don't leak which field was wrong.
const GENERIC_AUTH_ERROR = "Invalid credentials";


const Auth = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("login");

  // Login state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup state
  const [suUsername, setSuUsername] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  // Honeypot — real users never fill this; bots typically auto-fill all fields
  const [suHoneypot, setSuHoneypot] = useState("");

  // Forgot state
  const [forgotEmail, setForgotEmail] = useState("");

  // Resend confirmation
  const [resendEmail, setResendEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);

  /**
   * Login flow:
   *   1. Treat input as a username if it has no "@", otherwise as an email
   *   2. If username, look up the matching email in `profiles`
   *   3. Call signInWithPassword with that email
   *
   * Every failure path returns the SAME generic error message — never tell
   * the attacker whether the username/email exists vs the password is wrong.
   */
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let email = loginIdentifier.trim();
      // If the user entered a username (no @), look up their email from profiles
      if (!email.includes("@")) {
        const parsed = usernameSchema.safeParse(email);
        if (!parsed.success) {
          // Generic message to avoid revealing whether the username exists
          toast.error(GENERIC_AUTH_ERROR);
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("email")
          .eq("username", parsed.data)
          .maybeSingle();
        if (error || !data) {
          toast.error(GENERIC_AUTH_ERROR);
          return;
        }
        email = data.email;
      } else {
        const parsed = emailSchema.safeParse(email);
        if (!parsed.success) {
          toast.error(GENERIC_AUTH_ERROR);
          return;
        }
        email = parsed.data;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: loginPassword,
      });
      if (error) {
        // Always return the same generic message — never reveal whether
        // the email exists or whether only the password was wrong
        toast.error(GENERIC_AUTH_ERROR);
        return;
      }
      toast.success("Signed in");
      navigate("/");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Signup flow:
   *   1. Honeypot check — bots fill every input including the hidden one
   *   2. Confirm password matches
   *   3. Validate username/email/password against the schemas above
   *   4. Hand off to Supabase signUp() — the database trigger
   *      `handle_new_user` will auto-create the matching profiles row
   *
   * The username is sent in `options.data` so the trigger can pick it up
   * from `raw_user_meta_data->>'username'`.
   */
  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    // Honeypot check — silently reject bots without telling them why
    if (suHoneypot.trim() !== "") {
      toast.success("Check your email to confirm your account");
      return;
    }
    if (suPassword !== suConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    const username = usernameSchema.safeParse(suUsername);
    if (!username.success) {
      toast.error(username.error.errors[0].message);
      return;
    }
    const email = emailSchema.safeParse(suEmail);
    if (!email.success) {
      toast.error(email.error.errors[0].message);
      return;
    }
    const password = passwordSchema.safeParse(suPassword);
    if (!password.success) {
      toast.error(password.error.errors[0].message);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.data,
        password: password.data,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
          data: { username: username.data },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Check your email to confirm your account");
    } finally {
      setSubmitting(false);
    }
  };

  /** Sends a "reset your password" email via Supabase. */
  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    const email = emailSchema.safeParse(forgotEmail);
    if (!email.success) {
      toast.error(email.error.errors[0].message);
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
        redirectTo: getAuthRedirectUrl(),
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password reset email sent");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Re-sends the signup confirmation email. Supabase silently no-ops if
   * the address is already confirmed, so a successful response here does
   * NOT guarantee an email actually went out.
   */
  const handleResend = async (e: FormEvent) => {
    e.preventDefault();
    const email = emailSchema.safeParse(resendEmail);
    if (!email.success) {
      toast.error(email.error.errors[0].message);
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.data,
        options: { emailRedirectTo: getAuthRedirectUrl() },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Confirmation email re-sent. Check your inbox.");
    } finally {
      setSubmitting(false);
    }
  };

  const titles: Record<View, { label: string; icon: typeof LogIn }> = {
    login: { label: "Authenticate", icon: LogIn },
    signup: { label: "New Operator", icon: UserPlus },
    forgot: { label: "Recover Access", icon: KeyRound },
    resend: { label: "Resend Confirmation", icon: MailCheck },
  };
  const Icon = titles[view].icon;

  const inputClass =
    "w-full bg-cockpit/60 border border-border focus:border-primary/60 focus:outline-none rounded-sm px-3 py-2 text-sm font-mono text-card-foreground placeholder:text-muted-foreground/60 transition-colors";
  const labelClass = "text-[10px] font-mono uppercase tracking-wider text-muted-foreground";

  return (
    <main className="min-h-screen w-full bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-card-foreground transition-colors mb-4"
        >
          <ArrowLeft className="size-3" />
          Back to Deck
        </Link>

        <div className="glass-panel rounded-sm overflow-hidden">
          {/* Header bar */}
          <div className="border-b border-border bg-cockpit/80 px-5 py-3 flex items-center gap-2">
            <Icon className="size-4 text-primary" />
            <h1 className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-card-foreground">
              {titles[view].label}
            </h1>
            <span className="ml-auto text-[9px] font-mono text-muted-foreground">STRATO.OPS</span>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-4 border-b border-border">
            {(["login", "signup", "forgot", "resend"] as View[]).map((v) => {
              const active = view === v;
              const labels: Record<View, string> = {
                login: "Login",
                signup: "Sign Up",
                forgot: "Recover",
                resend: "Resend",
              };
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`text-[10px] font-mono uppercase tracking-wider py-2.5 transition-colors ${
                    active
                      ? "bg-primary/10 text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-card-foreground border-b-2 border-transparent"
                  }`}
                >
                  {labels[v]}
                </button>
              );
            })}
          </div>

          <div className="p-5">
            {view === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="login-id">Email or Username</label>
                  <input
                    id="login-id"
                    autoComplete="username"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    className={inputClass}
                    placeholder="operator@strato.ops"
                    required
                    maxLength={255}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="login-pw">Password</label>
                  <input
                    id="login-pw"
                    type="password"
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                    required
                    maxLength={128}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono text-[11px] font-bold uppercase tracking-wider py-2.5 rounded-sm hover:brightness-110 transition-all neon-glow-amber disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />}
                  Login
                </button>
                <div className="flex items-center justify-between pt-1 text-[10px] font-mono">
                  <button type="button" onClick={() => setView("signup")} className="text-muted-foreground hover:text-primary transition-colors">
                    Create account →
                  </button>
                  <button type="button" onClick={() => setView("forgot")} className="text-muted-foreground hover:text-primary transition-colors">
                    Forgot password?
                  </button>
                </div>
              </form>
            )}

            {view === "signup" && (
              <form onSubmit={handleSignUp} className="space-y-4">
                {/* Honeypot — hidden from real users; bots will auto-fill it */}
                <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
                  <label htmlFor="su-website">Website</label>
                  <input
                    id="su-website"
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={suHoneypot}
                    onChange={(e) => setSuHoneypot(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="su-username">Username</label>
                  <input
                    id="su-username"
                    value={suUsername}
                    onChange={(e) => setSuUsername(e.target.value)}
                    className={inputClass}
                    placeholder="callsign"
                    required
                    maxLength={32}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="su-email">Email</label>
                  <input
                    id="su-email"
                    type="email"
                    autoComplete="email"
                    value={suEmail}
                    onChange={(e) => setSuEmail(e.target.value)}
                    className={inputClass}
                    placeholder="operator@strato.ops"
                    required
                    maxLength={255}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="su-pw">Password</label>
                  <input
                    id="su-pw"
                    type="password"
                    autoComplete="new-password"
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                    className={inputClass}
                    placeholder="8+ chars, 1 uppercase, 1 number"
                    required
                    maxLength={128}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="su-confirm">Confirm Password</label>
                  <input
                    id="su-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={suConfirm}
                    onChange={(e) => setSuConfirm(e.target.value)}
                    className={inputClass}
                    placeholder="repeat password"
                    required
                    maxLength={128}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono text-[11px] font-bold uppercase tracking-wider py-2.5 rounded-sm hover:brightness-110 transition-all neon-glow-amber disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                  Create Account
                </button>
                <div className="text-[10px] font-mono text-center pt-1">
                  <button type="button" onClick={() => setView("login")} className="text-muted-foreground hover:text-primary transition-colors">
                    ← Already have an account? Login
                  </button>
                </div>
              </form>
            )}

            {view === "forgot" && (
              <form onSubmit={handleForgot} className="space-y-4">
                <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                  Enter the email associated with your account. We'll send a recovery link.
                </p>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="fp-email">Email</label>
                  <input
                    id="fp-email"
                    type="email"
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className={inputClass}
                    placeholder="operator@strato.ops"
                    required
                    maxLength={255}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono text-[11px] font-bold uppercase tracking-wider py-2.5 rounded-sm hover:brightness-110 transition-all neon-glow-amber disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
                  Send Reset Link
                </button>
                <div className="text-[10px] font-mono text-center pt-1">
                  <button type="button" onClick={() => setView("login")} className="text-muted-foreground hover:text-primary transition-colors">
                    ← Back to Login
                  </button>
                </div>
              </form>
            )}

            {view === "resend" && (
              <form onSubmit={handleResend} className="space-y-4">
                <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                  Didn't get the confirmation email? Enter your registered email and we'll send a fresh link.
                </p>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="rs-email">Email</label>
                  <input
                    id="rs-email"
                    type="email"
                    autoComplete="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    className={inputClass}
                    placeholder="operator@strato.ops"
                    required
                    maxLength={255}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono text-[11px] font-bold uppercase tracking-wider py-2.5 rounded-sm hover:brightness-110 transition-all neon-glow-amber disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <MailCheck className="size-3.5" />}
                  Resend Confirmation
                </button>
                <div className="text-[10px] font-mono text-center pt-1">
                  <button type="button" onClick={() => setView("login")} className="text-muted-foreground hover:text-primary transition-colors">
                    ← Back to Login
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default Auth;
