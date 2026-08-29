import { useState } from "react";
import { useOnlineCount } from "@/hooks/useOnlineCount";
import { useLifetimeVisitors } from "@/hooks/useLifetimeVisitors";

/**
 * OnlineCounter - click to toggle between live presence count and the
 * lifetime unique visitor count.
 */
export default function OnlineCounter() {
  const count = useOnlineCount();
  const lifetime = useLifetimeVisitors();
  const [showLifetime, setShowLifetime] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setShowLifetime((v) => !v)}
      title={showLifetime ? "Show live online count" : "Show lifetime visitors"}
      aria-label={showLifetime ? "Show live online count" : "Show lifetime visitors"}
      className="flex items-center gap-2 px-2 py-1 glass-panel cursor-pointer hover:border-primary/30 transition-colors"
    >
      {!showLifetime && <span className="online-pulse-dot" aria-hidden="true" />}
      <span
        className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
          showLifetime ? "text-neon-blue" : "text-[#00ff88]"
        }`}
      >
        {showLifetime
          ? `${lifetime != null ? lifetime.toLocaleString() : "..."} All Time`
          : `${count} Online`}
      </span>
    </button>
  );
}
