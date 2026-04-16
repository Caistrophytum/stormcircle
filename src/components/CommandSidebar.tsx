import { useState } from "react";
import { Radio, Map, Rss, ShieldCheck, Settings, User } from "lucide-react";

const navItems = [
  { id: "mesh", label: "Global Mesh", num: "01", icon: Map },
  { id: "tracker", label: "Cell Tracker", num: "02", icon: Radio },
  { id: "feed", label: "Atmospheric Feed", num: "03", icon: Rss },
];

const verifyItems = [
  { id: "queue", label: "Peer Queue", num: "04", icon: ShieldCheck, badge: "14 ACT" },
];

interface Props {
  activeView: string;
  onViewChange: (view: string) => void;
}

const CommandSidebar = ({ activeView, onViewChange }: Props) => {
  return (
    <aside className="w-64 border-r border-border bg-cockpit flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-6 border-b border-border flex items-center gap-3">
        <div className="size-3 rounded-full bg-neon-amber animate-pulse neon-glow-amber" />
        <span className="font-mono font-bold text-card-foreground tracking-tighter text-lg uppercase">
          Strato.Ops
        </span>
      </div>

      {/* Nav */}
      <nav className="p-4 flex-1 space-y-1">
        <div className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest px-2 mb-2">
          Tactical View
        </div>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm transition-colors text-left ${
              activeView === item.id
                ? "bg-secondary text-card-foreground border-l-2 border-primary"
                : "hover:bg-secondary/50 text-foreground"
            }`}
          >
            <span className="font-mono text-xs opacity-50">{item.num}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </button>
        ))}

        <div className="pt-6 text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest px-2 mb-2">
          Verification
        </div>
        {verifyItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-sm transition-colors ${
              activeView === item.id
                ? "bg-secondary text-card-foreground border-l-2 border-primary"
                : "hover:bg-secondary/50 text-foreground"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs opacity-50">{item.num}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </div>
            {item.badge && (
              <span className="bg-destructive/10 text-destructive font-mono text-[10px] px-1.5 py-0.5 border border-destructive/20">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* User card */}
      <div className="p-4 bg-background/40 border-t border-border">
        <div className="flex items-center gap-3 p-2 bg-shroud border border-border rounded">
          <div className="size-8 bg-secondary rounded flex items-center justify-center font-mono text-xs text-card-foreground">
            R7
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-card-foreground truncate">CAPT. ELARA VANCE</p>
            <p className="text-[10px] font-mono text-neon-green">LVL 4 VERIFIER</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default CommandSidebar;
