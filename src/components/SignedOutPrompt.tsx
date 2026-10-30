import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KEY = "signed-out-prompt-dismissed";
const HIDDEN_ON = ["/auth", "/reset-password"];

/** Once-per-visit nudge for signed-out visitors to sign in and set a hometown. */
export function SignedOutPrompt() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || user || HIDDEN_ON.includes(pathname)) {
      setOpen(false);
      return;
    }
    if (sessionStorage.getItem(KEY)) return;
    const t = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(t);
  }, [loading, user, pathname]);

  const dismiss = () => {
    sessionStorage.setItem(KEY, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono text-primary">You aren't signed in</DialogTitle>
          <DialogDescription>
            Some key features, like alerts for your hometown and posting in chat, aren't available.
            Sign in and set a hometown to get the full StormCircle experience.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={dismiss}>Not now</Button>
          <Button
            onClick={() => {
              dismiss();
              navigate("/auth");
            }}
          >
            Sign in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
