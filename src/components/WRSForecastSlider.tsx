import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (hours: number) => void;
  /** ISO UTC time of the selected forecast hour, if loaded. */
  time?: string | null;
  timezone?: string | null;
  loading?: boolean;
  className?: string;
}

function fmtLocal(iso: string, tz?: string | null) {
  try {
    return new Date(`${iso}:00Z`).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(tz ? { timeZone: tz } : {}),
    });
  } catch {
    return "";
  }
}

/** 0 to +24h scrubber for the simulated WRS. */
export default function WRSForecastSlider({ value, onChange, time, timezone, loading, className }: Props) {
  const label =
    value === 0
      ? "Now · live"
      : loading
        ? `+${value}h · loading…`
        : `+${value}h${time ? ` · ${fmtLocal(time, timezone)} local` : ""}`;
  return (
    <div className={cn("flex flex-col gap-1 font-mono", className)}>
      <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-muted-foreground">
        <button
          type="button"
          onClick={() => onChange(0)}
          className={cn("uppercase tracking-widest", value === 0 ? "text-primary" : "hover:text-foreground")}
        >
          Now
        </button>
        <span className={cn("tabular-nums", value > 0 && "text-primary")}>
          {label}
          {value > 0 && (
            <span className="ml-1.5 rounded border border-primary/40 bg-primary/10 px-1 text-[8px] text-primary">
              Forecast
            </span>
          )}
        </span>
        <span>+24h</span>
      </div>
      <input
        type="range"
        min={0}
        max={24}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="WRS forecast hour"
        className="h-1.5 w-full cursor-pointer accent-primary"
      />
    </div>
  );
}
