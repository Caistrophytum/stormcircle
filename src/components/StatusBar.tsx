import { useEffect, useState } from "react";
import { LogIn, User, Shield, ChevronDown } from "lucide-react";
import { useSelectedCity } from "@/contexts/CityContext";
import { useCurrentWeather } from "@/hooks/useCurrentWeather";
import {
  useUnitSystem,
  displayTemp,
  displayPressure,
} from "@/hooks/useUnitSystem";

interface Props {
  userRole: "guest" | "citizen" | "meteorologist";
  onSignIn: () => void;
}

const formatCoord = (lat: number, lon: number) => {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`;
};

const renderValue = (
  v: { value: number; unit: string } | null,
  fallbackUnit: string,
  loading: boolean,
  hasCity: boolean,
  digits = 1,
) => {
  if (!hasCity) return `— ${fallbackUnit}`;
  if (loading) return "...";
  if (v == null) return "ERR";
  return `${v.value.toFixed(digits)} ${v.unit}`;
};

const StatusBar = ({ userRole, onSignIn }: Props) => {
  const [time, setTime] = useState(new Date());
  const { selectedCity } = useSelectedCity();
  const weather = useCurrentWeather(
    selectedCity ? { lat: selectedCity.lat, lon: selectedCity.lon } : null,
  );
  const unitSystem = useUnitSystem();
  const tempDisplay = displayTemp(weather.temperatureC, unitSystem);
  const dewDisplay = displayTemp(weather.dewpointC, unitSystem);
  const pressureDisplay = displayPressure(weather.pressureHpa, unitSystem);
  const tempFallbackUnit = unitSystem === "metric" ? "°C" : "°F";
  const pressureFallbackUnit = unitSystem === "metric" ? "hPa" : "inHg";

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const zulu = time.toISOString().slice(11, 19);

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
  const hasCity = !!selectedCity;
  const coordText = selectedCity
    ? formatCoord(selectedCity.lat, selectedCity.lon)
    : "— SELECT CITY —";

  return (
    <header className="h-12 border-b border-border bg-cockpit/80 backdrop-blur-md flex items-center justify-between px-6 z-20 shrink-0">
      {/* Left: role badge + coords + pressure */}
      <div className="flex items-center gap-6">
        {badge && (
          <div className={`flex items-center gap-1.5 px-2 py-1 border rounded-sm ${badge.className}`}>
            <badge.icon className="size-3" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider">{badge.label}</span>
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-[9px] font-mono text-muted-foreground uppercase leading-none">
            {selectedCity ? selectedCity.name : "Coord"}
          </span>
          <span className="text-xs font-mono text-card-foreground">{coordText}</span>
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex flex-col">
          <span className="text-[9px] font-mono text-muted-foreground uppercase leading-none">Pressure</span>
          <span className="text-xs font-mono text-neon-blue">
            {renderValue(pressureDisplay, pressureFallbackUnit, weather.loading, hasCity, 1)}
          </span>
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex flex-col">
          <span className="text-[9px] font-mono text-muted-foreground uppercase leading-none">Humidity</span>
          <span className="text-xs font-mono text-card-foreground">
            {hasCity
              ? weather.loading
                ? "..."
                : weather.humidity == null
                  ? "ERR"
                  : `${Math.round(weather.humidity)}%`
              : "— %"}
          </span>
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex flex-col">
          <span className="text-[9px] font-mono text-muted-foreground uppercase leading-none">Temp</span>
          <span className="text-xs font-mono text-card-foreground">
            {renderValue(tempDisplay, tempFallbackUnit, weather.loading, hasCity, 1)}
          </span>
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex flex-col">
          <span className="text-[9px] font-mono text-muted-foreground uppercase leading-none">Dewpoint</span>
          <span className="text-xs font-mono text-card-foreground">
            {renderValue(dewDisplay, tempFallbackUnit, weather.loading, hasCity, 1)}
          </span>
        </div>
      </div>

      {/* Right: time + auth */}
      <div className="flex items-center gap-4">
        <div className="text-right">
          <span className="block text-[9px] font-mono text-muted-foreground leading-none">Mission Time</span>
          <span className="text-xs font-mono text-card-foreground">{zulu} Z</span>
        </div>

        {userRole === "guest" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onSignIn}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-mono text-[10px] font-bold uppercase tracking-wider rounded-sm hover:brightness-110 transition-all neon-glow-amber"
            >
              <LogIn className="size-3" />
              Sign In
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1 glass-panel cursor-pointer hover:border-primary/30 transition-colors">
            <div className="size-5 bg-secondary rounded flex items-center justify-center font-mono text-[9px] text-card-foreground">
              EV
            </div>
            <span className="text-[10px] font-mono text-card-foreground">VANCE</span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </div>
        )}
      </div>
    </header>
  );
};

export default StatusBar;
