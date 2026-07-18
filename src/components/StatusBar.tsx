import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, LogOut, User, Shield, ChevronDown, UserCog, HelpCircle, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
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
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
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

/**
 * Keyframes for the ruler text carousel. The animation only runs when the
 * content is wider than its container; CSS variables --container-width and
 * --content-width are injected at runtime to make the bounce distance exact.
 */
const RulerCarouselStyles = () => (
  <style>{`
    @keyframes ruler-bounce {
      0%, 100% { transform: translateX(0); }
      50% { transform: translateX(min(0px, calc(var(--container-width) - var(--content-width)))); }
    }
    .ruler-bounce {
      animation: ruler-bounce 8s ease-in-out infinite;
    }
  `}</style>
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

  const tempDisp = displayTemp(hometown.temperatureC, unitSystem);
  const dewDisp = displayTemp(hometown.dewpointC, unitSystem);
  const feelDisp = displayTemp(hometown.apparentTemperatureC, unitSystem);
  const windDisp = displayWindSpeed(hometown.windSpeedKmh, unitSystem);
  const hometownLabel = profile?.location
    ? `Now in ${profile.location.split(",")[0]}`
    : "Now in —";

  const rulerContainerRef = useRef<HTMLDivElement>(null);
  const rulerContentRef = useRef<HTMLDivElement>(null);
  const [rulerOverflows, setRulerOverflows] = useState(false);

  useEffect(() => {
    const container = rulerContainerRef.current;
    const content = rulerContentRef.current;
    if (!container || !content) return;
    const measure = () => setRulerOverflows(content.scrollWidth > container.clientWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [hometownLabel, hometown, profile?.location]);

  /** Dew point comfort categories (raw °C from Open-Meteo). */
  const dewPointDescriptor = (c: number) => {
    if (c < 4.9) return "Very Dry";
    if (c <= 9.9) return "Dry";
    if (c <= 14.9) return "Comfortable";
    if (c <= 19.9) return "Mostly Comfortable";
    if (c <= 23.9) return "Muggy";
    return "Oppressive";
  };

  /** UV index exposure categories. */
  const uvDescriptor = (uv: number) => {
    if (uv === 0) return "None";
    if (uv <= 2) return "Low";
    if (uv <= 5) return "Medium";
    if (uv <= 7) return "High";
    if (uv <= 10) return "Very High";
    return "Extreme";
  };

  /** Apparent temperature (Real Feel) categories (raw °C). */
  const realFeelDescriptor = (c: number) => {
    if (c < 11) return "Cold";
    if (c <= 16) return "Cool";
    if (c <= 21) return "Pleasant";
    if (c <= 26) return "Warm";
    if (c <= 31) return "Very Warm";
    if (c <= 37) return "Hot";
    if (c <= 41) return "Very Hot";
    if (c <= 45) return "Dangerous Heat";
    if (c <= 50) return "Very Dangerous Heat";
    if (c <= 55) return "Extremely Dangerous Heat";
    if (c <= 60) return "Extraordinarily Dangerous Heat";
    return "Extreme Heat";
  };

  const renderRulerMetric = (
    label: string,
    display: { value: number; unit: string } | null,
    raw: number | null,
    descriptor?: string,
  ) => {
    if (!hometownLoc) {
      return (
        <span key={label}>
          {label}: <span className="text-muted-foreground">—</span>
        </span>
      );
    }
    if (hometown.loading) {
      return (
        <span key={label}>
          {label}: <span className="text-muted-foreground">...</span>
        </span>
      );
    }
    if (display == null || raw == null) {
      return (
        <span key={label}>
          {label}: <span className="text-destructive">ERR</span>
        </span>
      );
    }
    const value = label === "UV" ? Math.round(display.value) : display.value.toFixed(0);
    return (
      <span key={label}>
        {label}: <span className="text-primary font-semibold">{value}{display.unit}</span>
        {descriptor && (
          <span className="text-card-foreground/55"> ({descriptor})</span>
        )}
      </span>
    );
  };

  const rulerSeparator = <span className="text-card-foreground/25">\</span>;

  return (
    <header className="h-12 border-b border-border bg-cockpit/95 flex items-center justify-between px-6 z-20 shrink-0">
      {/* Left: role badge + coords + hometown ruler */}
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
        <div className="flex flex-col w-28 shrink-0">
          <span
            className="text-[9px] font-mono text-muted-foreground uppercase leading-none truncate"
            title={selectedCity ? selectedCity.name : "Coord"}
          >
            {selectedCity ? selectedCity.name : "Coord"}
          </span>
          <span className="text-[10px] font-mono text-card-foreground tracking-tight truncate">
            {coordText}
          </span>
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-mono text-primary uppercase leading-none tracking-wide truncate">
            {hometownLabel}
          </span>
          <div
            ref={rulerContainerRef}
            className="relative mt-0.5 overflow-hidden min-w-0"
          >
            <div
              ref={rulerContentRef}
              className={cn(
                "flex items-center gap-x-3 text-[11px] font-mono text-card-foreground whitespace-nowrap",
                rulerOverflows && "ruler-bounce"
              )}
              style={{
                "--container-width": `${rulerContainerRef.current?.clientWidth ?? 0}px`,
                "--content-width": `${rulerContentRef.current?.scrollWidth ?? 0}px`,
              } as React.CSSProperties}
            >
              {!profile?.location ? (
                <span className="text-muted-foreground">
                  {user ? "Please choose a hometown from the account center portal." : "Sign in and set a hometown to see local conditions."}
                </span>
              ) : (
                <>
                  {renderRulerMetric("Temp", tempDisp, hometown.temperatureC)}
                  {rulerSeparator}
                  {renderRulerMetric("Dew", dewDisp, hometown.dewpointC, hometown.dewpointC != null ? dewPointDescriptor(hometown.dewpointC) : undefined)}
                  {rulerSeparator}
                  {renderRulerMetric("Real Feel", feelDisp, hometown.apparentTemperatureC, hometown.apparentTemperatureC != null ? realFeelDescriptor(hometown.apparentTemperatureC) : undefined)}
                  {rulerSeparator}
                  {renderRulerMetric("Wind", windDisp, hometown.windSpeedKmh)}
                  {rulerSeparator}
                  {renderRulerMetric(
                    "UV",
                    hometown.uvIndex != null ? { value: hometown.uvIndex, unit: "" } : null,
                    hometown.uvIndex,
                    hometown.uvIndex != null ? uvDescriptor(hometown.uvIndex) : undefined,
                  )}
                </>
              )}
            </div>
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
