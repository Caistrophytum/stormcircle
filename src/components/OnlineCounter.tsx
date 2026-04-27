import { useOnlineCount } from "@/hooks/useOnlineCount";

export default function OnlineCounter() {
  const count = useOnlineCount();

  return (
    <div className="flex items-center gap-2 px-2 py-1 glass-panel">
      <span className="online-pulse-dot" aria-hidden="true" />
      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00ff88]">
        {count} Online
      </span>
    </div>
  );
}
