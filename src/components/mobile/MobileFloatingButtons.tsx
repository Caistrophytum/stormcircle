import { useEffect, useRef } from "react";
import {
  Activity,
  AlertTriangle,
  HelpCircle,
  Menu,
  MessageCircle,
  Radio,
  Settings,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MobileScreenId } from "./MobileLayout";

interface Props {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpen: (screen: MobileScreenId) => void;
}

const items = [
  { id: "radar" as const, icon: Radio, label: "Radar", description: "Live precipitation scan", tone: "text-neon-blue" },
  { id: "alerts" as const, icon: AlertTriangle, label: "Alerts", description: "Warnings near you", tone: "text-destructive" },
  { id: "chat" as const, icon: MessageCircle, label: "Chat", description: "Community reports", tone: "text-neon-green" },
  { id: "exercise" as const, icon: Activity, label: "Exercise Comfort", description: "Outdoor conditions", tone: "text-primary" },
  { id: "account" as const, icon: Settings, label: "General Settings", description: "Profile and preferences", tone: "text-muted-foreground" },
  { id: "faq" as const, icon: HelpCircle, label: "Q&A", description: "Answers and support", tone: "text-muted-foreground" },
];

export default function MobileFloatingButtons({ open, onToggle, onClose, onOpen }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      window.requestAnimationFrame(() => firstItemRef.current?.focus());
    } else {
      document.body.style.overflow = "";
      if (wasOpen.current) triggerRef.current?.focus();
    }
    wasOpen.current = open;
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const choose = (screen: MobileScreenId) => {
    onClose();
    onOpen(screen);
  };

  return (
    <>
      <div
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 z-[490] bg-background/80 transition-opacity duration-200 motion-reduce:transition-none",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />

      <nav
        id="mobile-command-menu"
        aria-label="Main navigation"
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 left-0 z-[500] flex w-[min(78vw,18rem)] flex-col border-r border-border bg-secondary px-3 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-6 flex items-center gap-3 border-b border-border px-2 pb-4">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground neon-glow-amber">
            <Radio className="size-5" />
          </div>
          <div>
            <p className="font-mono text-xs font-bold uppercase text-primary">StormCircle</p>
            <p className="text-[10px] text-muted-foreground">Command menu</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                ref={index === 0 ? firstItemRef : undefined}
                type="button"
                variant="ghost"
                onClick={() => choose(item.id)}
                className="h-14 w-full justify-start rounded-md border border-transparent px-3 text-left hover:border-border hover:bg-background/70"
              >
                <Icon className={cn("!size-5", item.tone)} />
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-bold uppercase text-foreground">{item.label}</span>
                  <span className="block truncate text-[10px] font-normal text-muted-foreground">{item.description}</span>
                </span>
              </Button>
            );
          })}
        </div>

        <div className="mt-auto flex items-center gap-2 border-t border-border px-2 pt-4 font-mono text-[10px] uppercase text-neon-green">
          <span className="size-1.5 rounded-full bg-neon-green shadow-[0_0_6px_hsl(var(--neon-green))]" />
          Navigation ready
        </div>
      </nav>

      <Button
        ref={triggerRef}
        type="button"
        size="icon"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-command-menu"
        onClick={onToggle}
        className="fixed bottom-5 right-3 z-[510] size-11 rounded-md border border-primary/60 bg-card text-primary shadow-[0_0_12px_hsl(var(--primary)/0.3)] hover:bg-secondary"
      >
        {open ? <X className="!size-5" /> : <Menu className="!size-5" />}
      </Button>
    </>
  );
}