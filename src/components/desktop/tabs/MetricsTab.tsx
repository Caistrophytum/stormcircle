/**
 * MetricsTab — WRS filling circle + physical parameters filling line + virtual
 * parameter cards. Colors shift gradually as values change (CSS transitions
 * on stroke / background).
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Loader2 } from "lucide-react";
import { useWRSMetrics } from "@/hooks/useWRSMetrics";
import { useAuth } from "@/hooks/useAuth";
import { useRadarContext } from "@/contexts/RadarContext";
import { useCitySearch } from "@/hooks/useCitySearch";
import { useLocalClock } from "@/hooks/useLocalClock";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";



function wrsColor(v: number) {
  // Linear HSL interpolation green→amber→red
  const stops = [
    { at: 0, h: 142, s: 100, l: 50 },
    { at: 40, h: 60, s: 100, l: 55 },
    { at: 70, h: 28, s: 100, l: 55 },
    { at: 100, h: 0, s: 100, l: 55 },
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (v >= a.at && v <= b.at) {
      const t = (v - a.at) / (b.at - a.at);
      const h = a.h + (b.h - a.h) * t;
      const s = a.s + (b.s - a.s) * t;
      const l = a.l + (b.l - a.l) * t;
      return `hsl(${h} ${s}% ${l}%)`;
    }
  }
  return `hsl(0 100% 55%)`;
}

const PHYS_COLORS = ["hsl(190 100% 55%)", "hsl(280 90% 65%)", "hsl(36 100% 55%)"];
const VIRTUAL_COLORS = [
  "hsl(0 100% 60%)",
  "hsl(28 100% 55%)",
  "hsl(48 100% 55%)",
  "hsl(190 100% 55%)",
  "hsl(280 90% 65%)",
];

/** Compact magnifier button → floating city search console. */
function CitySearchButton({
  onPick,
  accent,
}: {
  onPick: (city: { name: string; lat: number; lon: number; countryCode?: string }) => void;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { results, loading, error } = useCitySearch(query);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Search city"
          className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-white/10"
          style={{ border: `1px solid ${accent}55`, color: accent }}
        >
          <Search className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2 z-[1300] glass-panel">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any city…"
            className="h-8 pl-7 font-mono text-xs"
          />
          {loading && (
            <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="mt-2 max-h-56 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-1 py-2 text-center font-mono text-[10px] text-muted-foreground">
              {error
                ? "Search error."
                : query.trim().length < 2
                  ? "Type at least 2 characters."
                  : loading
                    ? "Searching…"
                    : "No city found."}
            </p>
          ) : (
            results.map((city) => {
              const cc = (city.country_code ?? "").toUpperCase();
              const label =
                cc && cc !== "US"
                  ? [city.name, city.admin1, cc].filter(Boolean).join(", ")
                  : city.admin1
                    ? `${city.name}, ${city.admin1}`
                    : city.name;
              return (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => {
                    onPick({
                      name: label,
                      lat: city.latitude,
                      lon: city.longitude,
                      countryCode: cc || undefined,
                    });
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left font-mono text-[11px] hover:bg-white/10"
                >
                  <span className="font-bold text-primary">{city.name}</span>
                  {city.admin1 && <span className="text-muted-foreground">/ {city.admin1}</span>}
                  {cc && <span className="ml-auto text-[9px] text-muted-foreground">{cc}</span>}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function MetricsTab() {

  const { threatLevel, physicalNodes, soundingNodes, stationActive, physGatePercent } = useWRSMetrics();
  const { profile } = useAuth();
  const radar = useRadarContext();
  const cityName = radar.selectedCity?.name ?? profile?.location?.split(",")[0]?.trim() ?? null;
  const { time: localTime, timezone } = useLocalClock(
    radar.selectedCity?.lat ?? null,
    radar.selectedCity?.lon ?? null,
  );


  const size = 140;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (threatLevel / 100) * c;
  const color = wrsColor(threatLevel);

  // Physical: single line, each param a segment sized by wrsContribution %.
  const physTotal = physicalNodes.reduce((s, n) => s + n.wrsContribution, 0);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <div
          className="font-mono text-[11px] font-bold uppercase tracking-widest"
          style={{ color, textShadow: `0 0 8px ${color}`, transition: "color 800ms ease" }}
        >
          In {cityName ?? "your area"}
        </div>
        <CitySearchButton
          onPick={(city) => radar.setSelectedCity(city)}
          accent={color}
        />
        <div
          className="ml-auto rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums"
          title={`Local time — ${timezone}`}
          style={{
            color,
            border: `1px solid ${color}55`,
            background: "rgba(255,255,255,0.04)",
            textShadow: `0 0 8px ${color}`,
            transition: "color 800ms ease",
          }}
        >
          {localTime}
          <span className="ml-1 text-[8px] text-muted-foreground">LOCAL</span>
        </div>
      </div>


      {/* WRS circle + physical line */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: size, height: size, overflow: "visible" }}>
          <svg width={size} height={size} className="-rotate-90" style={{ overflow: "visible" }}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={stroke}
              fill="none"
            />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={color}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={c}
              initial={false}
              animate={{ strokeDashoffset: c - dash }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              style={{
                filter: `drop-shadow(0 0 8px ${color})`,
                transition: "stroke 800ms ease",
              }}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="font-mono text-3xl font-bold tabular-nums"
              style={{ color, transition: "color 800ms ease", textShadow: `0 0 8px ${color}` }}
            >
              {threatLevel}
            </span>
            <span className="mt-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              WRS
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
            Physical Parameters
          </div>
          <div
            className="flex h-6 overflow-hidden rounded-full"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {physicalNodes.map((p, i) => {
              const col = PHYS_COLORS[i % PHYS_COLORS.length];
              const pct = Math.max(0, Math.min(100, p.wrsContribution));
              return (
                <motion.div
                  key={p.label}
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  style={{
                    background: col,
                    boxShadow: `inset 0 0 12px ${col}, 0 0 6px ${col}`,
                  }}
                  title={`${p.label}: ${p.wrsContribution}%`}
                />
              );
            })}
          </div>
          <div className="flex">
            {physicalNodes.map((p, i) => (
              <div key={p.label} className="flex flex-1 flex-col items-center gap-0.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: PHYS_COLORS[i % PHYS_COLORS.length],
                    boxShadow: `0 0 6px ${PHYS_COLORS[i % PHYS_COLORS.length]}`,
                  }}
                />
                <span className="text-[9px] font-mono uppercase text-muted-foreground">
                  {p.label}
                </span>
                <span
                  className="text-[10px] font-mono font-bold tabular-nums"
                  style={{ color: p.colorHsl, transition: "color 500ms ease" }}
                >
                  {p.value}
                  <span className="ml-0.5 text-[8px] text-muted-foreground">{p.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>


      </div>

      {/* Virtual parameters — rounded boxes */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
            Virtual Parameters
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase"
            style={{
              color: "#ff9d00",
              border: "1px solid rgba(255,157,0,0.35)",
              background: "rgba(255,157,0,0.08)",
            }}
          >
            Scaled to {physGatePercent}%
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {soundingNodes.map((n, i) => {
            const accent = VIRTUAL_COLORS[i % VIRTUAL_COLORS.length];
            const lit = n.primary;
            return (
              <div
                key={n.label}
                className="relative flex flex-col gap-1 rounded-xl p-2"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${accent}55`,
                  borderLeft: lit ? "3px solid #ff9d00" : `1px solid ${accent}55`,
                  boxShadow: lit
                    ? `inset 2px 0 10px rgba(255,157,0,0.45), -1px 0 12px rgba(255,157,0,0.7), inset 0 0 12px ${accent}18`
                    : `inset 0 0 12px ${accent}18, 0 0 8px ${accent}22`,
                  transition: "border-color 500ms ease, box-shadow 500ms ease",
                }}
              >
                <div className="text-[8px] font-mono uppercase leading-none text-muted-foreground">
                  {n.label}
                </div>
                <div
                  className="font-mono text-sm font-bold leading-tight tabular-nums"
                  style={{ color: n.colorHsl, transition: "color 500ms ease" }}
                >
                  {n.value}
                  <span className="ml-0.5 text-[8px] text-muted-foreground">{n.unit}</span>
                </div>
                <div
                  className="text-[9px] font-mono font-bold leading-none"
                  style={{ color: accent }}
                >
                  {n.wrsContribution}%
                </div>
              </div>
            );
          })}
        </div>
        {!stationActive && (
          <p className="mt-2 text-center text-[10px] font-mono italic text-muted-foreground">
            Pick a radar station on the map to enable metrics.
          </p>
        )}
      </div>
    </div>
  );
}
