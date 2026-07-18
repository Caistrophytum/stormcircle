import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, LogOut, User, Shield, ChevronDown, UserCog, HelpCircle, Ruler } from "lucide-react";
import { useSelectedCity } from "@/contexts/CityContext";
import { useHometownWeather } from "@/hooks/useHometownWeather";
import { useHomeCityRisk } from "@/hooks/useHomeCityRisk";

import {
  useUnitSystem,
  toggleUnitSystem,
  displayTemp,
  displayWindSpeed,
} from "@/hooks/useUnitSystem";
import { useAuth } from "@/hooks/useAuth";
import OnlineCounter from "@/components/OnlineCounter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const formatCoord = (lat: number, lon: number) => {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`;
};

/**
 * MissionClock — isolated 1 Hz UTC ticker.
 *
 * Extracted so the 1-second `setInterval` only re-renders this ~20-char
 * span instead of the entire StatusBar (which owns weather, unit toggle,
 * user dropdown, online counter, etc.).
 */
const MissionClock = () => {
  const [zulu, setZulu] = useState(() => new Date().toISOString().slice(11, 19));
  useEffect(() => {
    const id = setInterval(() => setZulu(new Date().toISOString().slice(11, 19)), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-xs font-mono text-card-foreground">{zulu} Z</span>;
};

/** Compact metric cell for the "Now in X" ruler. */
const MetricCell = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) => (
  <div className="flex flex-col">
    <span className="text-[9px] font-mono text-muted-foreground uppercase leading-none">{label}</span>
    <span
      className={`text-xs font-mono ${tone === "accent" ? "text-neon-blue" : "text-card-foreground"}`}
    >
      {value}
    </span>
  </div>
);

const StatusBar = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const userRole: "guest" | "citizen" | "meteorologist" = !user
    ? "guest"
    : profile?.badge === "Meteorologist"
      ? "meteorologist"
      : "citizen";
  const { selectedCity } = useSelectedCity();
  const homeRisk = useHomeCityRisk(profile?.location ?? null);
  const hometownLoc = homeRisk.coords
    ? { lat: homeRisk.coords.lat, lon: homeRisk.coords.lon }
    : null;
  const hometown = useHometownWeather(hometownLoc);
  const unitSystem = useUnitSystem();
  const tempFallbackUnit = unitSystem === "metric" ? "°C" : "°F";
  const windFallbackUnit = unitSystem === "metric" ? "km/h" : "mph";

  const roleBadge = {
    guest: null,
    citizen: {
      label: "CITIZEN",
      icon: User,
      className: "bg-neon-blue/10 text-neon-blue border-neon-blue/20",
    },
    meteorologist: {
      label: "METEOROLOGIST",
      icon: Shield,
      className: "bg-primary/10 text-primary border-primary/20",
    },
  };

  const badge = roleBadge[userRole];
  const coordText = selectedCity
    ? formatCoord(selectedCity.lat, selectedCity.lon)
    : "— SELECT CITY —";

  const renderMetric = (
    display: { value: number; unit: string } | null,
    fallbackUnit: string,
    digits = 0,
  ) => {
    if (!hometownLoc) return `— ${fallbackUnit}`;
    if (hometown.loading) return "...";
    if (!display) return "ERR";
    return `${display.value.toFixed(digits)} ${display.unit}`.trim();
  };

  const uvText = !hometownLoc
    ? "—"
    : hometown.loading
      ? "..."
      : hometown.uvIndex == null
        ? "ERR"
        : `${Math.round(hometown.uvIndex)}`;

  const tempDisp = displayTemp(hometown.temperatureC, unitSystem);
  const dewDisp = displayTemp(hometown.dewpointC, unitSystem);
  const feelDisp = displayTemp(hometown.apparentTemperatureC, unitSystem);
  const windDisp = displayWindSpeed(hometown.windSpeedKmh, unitSystem);
  const hometownLabel = profile?.location
    ? `Now in ${profile.location.split(",")[0]}`
    : "Now in —";



  return (
    <header className="h-12 border-b border-border bg-cockpit/95 flex items-center justify-between px-6 z-20 shrink-0">
      {/* Left: role badge + coords + pressure */}
      <div className="flex items-center gap-6">
        {badge && (
          <div className={`flex items-center gap-1.5 px-2 py-1 border rounded-sm ${badge.className}`}>
            <badge.icon className="size-3" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider">{badge.label}</span>
          </div>
        )}
        <button
          onClick={() => navigate("/faq")}
          aria-label="Open Frequently Asked Questions"
          title="FAQ"
          className="flex items-center gap-1.5 px-2 py-1 border border-primary/25 bg-primary/5 text-primary rounded-sm hover:bg-primary/10 hover:border-primary/50 transition-colors"
        >
          <HelpCircle className="size-3" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider">FAQ</span>
        </button>
        <button
          onClick={toggleUnitSystem}
          aria-label="Toggle metric / imperial units"
          title={`Switch to ${unitSystem === "metric" ? "imperial" : "metric"}`}
          className="flex items-center gap-1.5 px-2 py-1 border border-neon-blue/25 bg-neon-blue/5 text-neon-blue rounded-sm hover:bg-neon-blue/10 hover:border-neon-blue/50 transition-colors"
        >
          <Ruler className="size-3" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
            {unitSystem === "metric" ? "SI" : "US"}
          </span>
        </button>
        <div className="flex flex-col">
          <span className="text-[9px] font-mono text-muted-foreground uppercase leading-none">
            {selectedCity ? selectedCity.name : "Coord"}
          </span>
          <span className="text-xs font-mono text-card-foreground">{coordText}</span>
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex flex-col">
          <span className="text-[9px] font-mono text-primary uppercase leading-none tracking-wide">
            {hometownLabel}
          </span>
          <div className="flex items-center gap-3 mt-0.5">
            <MetricCell label="Temp" value={renderMetric(tempDisp, tempFallbackUnit, 0)} />
            <MetricCell label="Dew" value={renderMetric(dewDisp, tempFallbackUnit, 0)} />
            <MetricCell label="Real Feel" value={renderMetric(feelDisp, tempFallbackUnit, 0)} />
            <MetricCell label="Wind" value={renderMetric(windDisp, windFallbackUnit, 0)} />
            <MetricCell label="UV" value={uvText} tone="accent" />
          </div>
        </div>
      </div>



      {/* Right: time + auth */}
      <div className="flex items-center gap-4">
        <div className="text-right">
          <span className="block text-[9px] font-mono text-muted-foreground leading-none">Mission Time</span>
          <MissionClock />
        </div>

        <OnlineCounter />

        {userRole === "guest" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/auth")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-mono text-[10px] font-bold uppercase tracking-wider rounded-sm hover:brightness-110 transition-all neon-glow-amber"
            >
              <LogIn className="size-3" />
              Sign In
            </button>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 px-2 py-1 glass-panel cursor-pointer hover:border-primary/30 transition-colors"
              >
                <div className="size-5 bg-secondary rounded flex items-center justify-center font-mono text-[9px] text-card-foreground uppercase">
                  {(profile?.username ?? user?.email ?? "??").slice(0, 2)}
                </div>
                <span className="text-[10px] font-mono text-card-foreground uppercase truncate max-w-[120px]">
                  {profile?.username ?? user?.email ?? "Operator"}
                </span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 font-mono">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Signed in as
                <div className="text-card-foreground normal-case mt-0.5 truncate">
                  {profile?.email ?? user?.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigate("/account")}
                className="text-[11px] uppercase tracking-wider cursor-pointer"
              >
                <UserCog className="size-3.5 mr-2" />
                Account Center
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  navigate("/auth");
                }}
                className="text-[11px] uppercase tracking-wider cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="size-3.5 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
};

export default StatusBar;
