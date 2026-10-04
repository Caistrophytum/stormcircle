import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { SyncSeconds, SyncShellCircle } from "@/components/SyncCountdown";
import { Button } from "@/components/ui/button";
import type { WRSNode } from "@/lib/wrs";
import { cn } from "@/lib/utils";

interface MobileWRSPanelProps {
  nodes: WRSNode[];
  physicalNodes: WRSNode[];
  threatLevel: number;
  physGatePercent: number;
  stationActive: boolean;
  cityName: string;
  localTime: string;
  timezone: string;
}

const METER_SIZE = 124;
const METER_STROKE = 10;
const SHELL_PADDING = 8;
const SHELL_SIZE = METER_SIZE + SHELL_PADDING * 2;
const SHELL_COLOR = "hsl(var(--neon-blue))";

function scoreColor(score: number) {
  if (score > 85) return "hsl(var(--neon-red))";
  if (score >= 61) return "hsl(var(--severity-warning))";
  if (score >= 31) return "hsl(var(--neon-amber))";
  return "hsl(var(--neon-green))";
}

function MetricGrid({ nodes }: { nodes: WRSNode[] }) {
  const primaryNodes = nodes.filter((node) => node.primary);
  const secondaryNodes = nodes.filter((node) => !node.primary);
  return (
    <div className="flex flex-col gap-1.5">
      {primaryNodes.length > 0 && <MetricRow nodes={primaryNodes} />}
      {primaryNodes.length > 0 && secondaryNodes.length > 0 && (
        <div className="border-t border-dashed border-primary/15" />
      )}
      {secondaryNodes.length > 0 && <MetricRow nodes={secondaryNodes} />}
    </div>
  );
}

function MetricRow({ nodes }: { nodes: WRSNode[] }) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))` }}
    >
      {nodes.map((node) => (
        <div
          key={node.label}
          className={cn(
            "relative min-w-0 overflow-hidden border-l-2 bg-background px-1 py-1.5 font-mono",
            node.primary
              ? "border-l-primary shadow-[inset_3px_0_6px_hsl(var(--primary)/0.45)]"
              : "border-l-primary/30",
          )}
        >
          <div className="truncate pr-5 text-[7px] leading-none text-muted-foreground">{node.label}</div>
          <div
            className="mt-1 truncate text-[11px] font-bold leading-none tabular-nums"
            style={{ color: node.color }}
          >
            {node.value}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1 text-[7px] leading-none text-muted-foreground">
            <span className="truncate">{node.unit}</span>
            {node.primary && <span className="shrink-0 text-[6px] font-bold text-primary">PRIMARY</span>}
          </div>
          <div className="absolute right-0.5 top-0.5 rounded-sm bg-foreground px-1 text-[8px] font-bold leading-3 text-background">
            {node.w}%
          </div>
        </div>
      ))}
    </div>
  );
}

function ParameterMenu({
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-primary/20">
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        onClick={onToggle}
        className="h-9 w-full justify-start rounded-none px-0 font-mono text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-primary/5 hover:text-primary"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        <span>{title}</span>
        {meta && <span className="ml-auto text-[8px] tracking-normal text-primary/60">{meta}</span>}
      </Button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

export default function MobileWRSPanel({
  nodes,
  physicalNodes,
  threatLevel,
  physGatePercent,
  stationActive,
  cityName,
  localTime,
  timezone,
}: MobileWRSPanelProps) {
  const [virtualOpen, setVirtualOpen] = useState(false);
  const [physicalOpen, setPhysicalOpen] = useState(false);
  const color = scoreColor(threatLevel);
  const radius = (METER_SIZE - METER_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const scoreLength = (threatLevel / 100) * circumference;

  return (
    <section className="relative shrink-0 overflow-hidden rounded-sm border-l-2 border-l-primary/40 bg-gradient-to-r from-primary/5 to-transparent px-3 pb-1 pt-2 font-mono">
      <div className="pointer-events-none absolute right-0 top-0 h-5 w-5 border-r border-t border-primary/20" />

      <div className="flex min-h-[140px] items-center justify-between gap-3">
        <div className="flex h-[140px] min-w-0 flex-1 flex-col justify-center">
          <div className="text-[8px] uppercase tracking-[0.3em] text-primary/50">Risk telemetry</div>
          <h2 className="mt-2 max-w-[150px] text-[15px] font-bold uppercase leading-tight text-primary">
            Weather Risk Score:
          </h2>
          <div className="mt-3 truncate text-[8px] uppercase tracking-wider text-primary/60">In {cityName}</div>
          <div className="mt-1 text-[8px] uppercase text-muted-foreground" title={`Local time - ${timezone}`}>
            {localTime} local
          </div>
        </div>

        <div className="relative shrink-0" style={{ width: SHELL_SIZE, height: SHELL_SIZE }}>
          <SyncShellCircle size={SHELL_SIZE} stroke={3} color={SHELL_COLOR} />
          <svg
            width={METER_SIZE}
            height={METER_SIZE}
            className="absolute -rotate-90"
            style={{ left: SHELL_PADDING, top: SHELL_PADDING, overflow: "visible" }}
            aria-hidden
          >
            <circle
              cx={METER_SIZE / 2}
              cy={METER_SIZE / 2}
              r={radius}
              stroke="hsl(var(--foreground) / 0.08)"
              strokeWidth={METER_STROKE}
              fill="none"
            />
            <motion.circle
              cx={METER_SIZE / 2}
              cy={METER_SIZE / 2}
              r={radius}
              stroke={color}
              strokeWidth={METER_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={false}
              animate={{ strokeDashoffset: circumference - scoreLength }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              style={{ filter: `drop-shadow(0 0 7px ${color})` }}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold tabular-nums" style={{ color }}>{threatLevel}</span>
            <span className="mt-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">WRS</span>
            <SyncSeconds className="mt-0.5 text-[9px] font-bold tabular-nums text-neon-blue [text-shadow:0_0_6px_hsl(var(--neon-blue))]" />
          </div>
        </div>
      </div>

      <ParameterMenu
        title="Virtual Parameters"
        meta={`Scaled to ${physGatePercent}%`}
        open={virtualOpen}
        onToggle={() => setVirtualOpen((value) => !value)}
      >
        <MetricGrid nodes={nodes} columns={5} />
      </ParameterMenu>

      <ParameterMenu
        title="Physical Parameters"
        open={physicalOpen}
        onToggle={() => setPhysicalOpen((value) => !value)}
      >
        <MetricGrid nodes={physicalNodes} columns={3} />
      </ParameterMenu>

      {!stationActive && (virtualOpen || physicalOpen) && (
        <p className="pb-2 text-center text-[9px] italic text-muted-foreground">
          Pick a radar station on the map to enable metrics.
        </p>
      )}
    </section>
  );
}