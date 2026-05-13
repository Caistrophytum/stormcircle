/**
 * ResetPassword — destination page for password-recovery email links.
 *
 * Supabase appends `#access_token=...&type=recovery` to the URL. The auth
 * client picks that up automatically and fires a `PASSWORD_RECOVERY` event,
 * after which `supabase.auth.updateUser({ password })` will succeed.
 *
 * Must be a public route (no auth gate) — the user is technically signed in
 * via the recovery token but hasn't chosen a new password yet.
 */
import { FormEvent, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters" })
  .max(72, { message: "Password must be 72 characters or less" });

const ResetPassword = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // The auth client parses the recovery token from the URL hash on load
    // and emits PASSWORD_RECOVERY. We also check the existing session in case
    // the event fired before this listener mounted.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated");
      navigate("/", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Reset Password — StormCircle</title>
        <meta name="description" content="Reset your StormCircle account password to regain access to real-time storm reporting and weather alerts." />
        <link rel="canonical" href="https://stormcircle.net/reset-password" />
      </Helmet>
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-8 shadow-lg">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reset password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ready
              ? "Choose a new password for your account."
              : "Validating your reset link…"}
          </p>
        </div>

        {ready && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </main>
    </>
  );
};

export default ResetPassword;
