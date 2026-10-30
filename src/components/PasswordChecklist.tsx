import { Check, X } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/passwordRules";

/** Live list of password rules; each turns green once met. */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="space-y-0.5 pt-1" aria-live="polite">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li
            key={r.id}
            className={`flex items-center gap-1.5 text-[11px] font-mono ${ok ? "text-neon-green" : "text-muted-foreground"}`}
          >
            {ok ? <Check className="size-3" /> : <X className="size-3" />}
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
