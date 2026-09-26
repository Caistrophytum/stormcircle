/**
 * HometownConditions - the mobile "Now in [hometown]" HUD telemetry card.
 *
 * Visual reform of the former dense text list: one line per parameter,
 * avionics-style label / leader / value rows in JetBrains Mono, amber on
 * obsidian. Units follow the shared US/SI toggle.
 */
import { useUnitSystem, displayTemp, displayWindSpeed, displayPressure } from "@/hooks/useUnitSystem";
import { pressureTrendDescriptor, type HometownWeather } from "@/hooks/useHometownWeather";

const AMBER = "#ff9d00";
const AMBER_DIM = "rgba(255,157,0,0.5)";
const AMBER_FAINT = "rgba(255,157,0,0.18)";
const MONO = "'JetBrains Mono', monospace";

/** Beaufort-scale wind wording (source value is km/h). */
export function beaufortDescriptor(kmh: number): string {
  if (kmh < 1) return "Calm";
  if (kmh <= 5) return "Light Air";
  if (kmh <= 11) return "Light Breeze";
  if (kmh <= 19) return "Gentle Breeze";
  if (kmh <= 28) return "Moderate Breeze";
  if (kmh <= 38) return "Fresh Breeze";
  if (kmh <= 49) return "Strong Breeze";
  if (kmh <= 61) return "Near Gale";
  if (kmh <= 74) return "Gale";
  if (kmh <= 88) return "Strong Gale";
  if (kmh <= 102) return "Storm";
  if (kmh <= 117) return "Violent Storm";
  return "Hurricane Force";
}

/** US AQI category wording. */
export function aqiDescriptor(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for Sensitive Groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

/** Dew point comfort categories (raw degrees C from Open-Meteo). */
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

/** Apparent temperature (Real Feel) categories (raw degrees C). */
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

/** Severity color for a wording chip: calm/green -> mid/amber -> hot/red. */
function severityColor(word: string): string {
  const calm = ["Calm", "Light Air", "Light Breeze", "Gentle Breeze", "Good", "None", "Low", "Pleasant", "Comfortable", "Dry", "Very Dry", "Moderate"];
  const warn = ["Moderate Breeze", "Fresh Breeze", "Medium", "Cool", "Warm", "Mostly Comfortable", "Muggy", "Unhealthy for Sensitive Groups"];
  const hot = ["Strong Breeze", "Near Gale", "Gale", "Strong Gale", "Storm", "Violent Storm", "Hurricane Force", "High", "Very High", "Extreme", "Hot", "Very Hot", "Unhealthy", "Very Unhealthy", "Hazardous", "Oppressive", "Very Dry"];
  if (calm.includes(word)) return "hsl(120 60% 55%)";
  if (warn.includes(word)) return "hsl(50 95% 55%)";
  if (hot.includes(word)) return "hsl(0 80% 60%)";
  // Dangerous heat wording gets its own deep-red tier.
  return "hsl(0 85% 50%)";
}

interface Props {
  cityName: string | null;
  weather: HometownWeather;
  signedIn: boolean;
}

export default function HometownConditions({ cityName, weather, signedIn }: Props) {
  const unitSystem = useUnitSystem();

  /** Small numeric readout: value + unit, or loading/ERR fallbacks. */
  const readout = (
    display: { value: number; unit: string } | null,
    opts?: { decimals?: number },
  ) => {
    if (weather.loading) {
      return <span style={{ color: "#888" }}>...</span>;
    }
    if (display == null) {
      return <span style={{ color: "#ff6b6b" }}>ERR</span>;
    }
    const d = opts?.decimals ?? (display.value < 10 && display.value !== 0 ? 1 : 0);
    return (
      <span style={{ color: AMBER, fontWeight: 700 }}>
        {display.value.toFixed(d)}
        <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>{display.unit}</span>
      </span>
    );
  };

  /** Full parameter row: label / leader / value + wording chip. */
  const row = (
    key: string,
    label: string,
    valueNode: React.ReactNode,
    wording?: string | null,
    accent = false,
  ) => (
    <div
      key={key}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        padding: accent ? "6px 0 8px" : "5px 0",
        borderBottom: accent ? `1px solid ${AMBER_FAINT}` : "none",
      }}
    >
      <span
        style={{
          fontSize: "9px",
          color: AMBER_DIM,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: "1px", background: AMBER_FAINT, opacity: 0.6 }} />
      <span style={{ display: "flex", alignItems: "baseline", gap: "6px", whiteSpace: "nowrap" }}>
        {valueNode}
        {wording && weather.loading !== true && (
          <span
            style={{
              fontSize: "8px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              padding: "1px 4px",
              color: severityColor(wording),
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${severityColor(wording)}55`,
            }}
          >
            {wording}
          </span>
        )}
      </span>
    </div>
  );

  const pressureTrend = pressureTrendDescriptor(weather.pressureTrend3hHpa);
  const trendArrow =
    weather.pressureTrend3hHpa == null
      ? ""
      : weather.pressureTrend3hHpa >= 2
        ? "↗"
        : weather.pressureTrend3hHpa <= -2
          ? "↘"
          : "→";

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderLeft: "2px solid rgba(255,157,0,0.4)",
        background: "linear-gradient(90deg, rgba(255,157,0,0.05), transparent 70%)",
        padding: "10px 12px 8px",
        borderRadius: "2px",
      }}
    >
      {/* Avionics corner bracket */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "20px",
          height: "20px",
          borderTop: `1px solid ${AMBER_FAINT}`,
          borderRight: `1px solid ${AMBER_FAINT}`,
        }}
      />

      {/* Header */}
      <div style={{ marginBottom: "6px" }}>
        <div
          style={{
            fontSize: "8px",
            color: AMBER_DIM,
            textTransform: "uppercase",
            letterSpacing: "0.3em",
            fontFamily: MONO,
            marginBottom: "2px",
          }}
        >
          Current conditions
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontWeight: 700,
            color: AMBER,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            fontFamily: MONO,
            overflow: "hidden",
          }}
        >
          <span
            className="animate-pulse"
            style={{ width: "6px", height: "6px", borderRadius: "9999px", background: AMBER, flexShrink: 0 }}
          />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Now in {cityName ?? "your hometown"}
          </span>
        </div>
      </div>

      {!cityName ? (
        <div style={{ fontSize: "10px", color: "#888", fontFamily: MONO, padding: "4px 0" }}>
          {signedIn
            ? "Please choose a hometown from the account center portal."
            : "Sign in and set a hometown to see local conditions."}
        </div>
      ) : (
        <>
          {/* Temp // Dew - large combined readout */}
          {row(
            "tempdew",
            "Temp // Dew",
            weather.loading ? (
              <span style={{ color: "#888" }}>...</span>
            ) : weather.temperatureC == null && weather.dewpointC == null ? (
              <span style={{ color: "#ff6b6b" }}>ERR</span>
            ) : (
              <span style={{ display: "flex", alignItems: "baseline", gap: "4px", whiteSpace: "nowrap" }}>
                {readout(displayTemp(weather.temperatureC, unitSystem))}
                <span style={{ color: AMBER_DIM, fontStyle: "italic", margin: "0 4px" }}>/</span>
                {readout(displayTemp(weather.dewpointC, unitSystem))}
              </span>
            ),
            undefined,
            true,
          )}

          {/* Real Feel */}
          {row(
            "realfeel",
            "Real Feel",
            readout(displayTemp(weather.apparentTemperatureC, unitSystem)),
            weather.apparentTemperatureC != null && !weather.loading
              ? realFeelDescriptor(weather.apparentTemperatureC)
              : null,
          )}

          {/* Wind */}
          {row(
            "wind",
            "Wind",
            readout(displayWindSpeed(weather.windSpeedKmh, unitSystem)),
            weather.windSpeedKmh != null && !weather.loading ? beaufortDescriptor(weather.windSpeedKmh) : null,
          )}

          {/* UV */}
          {row(
            "uv",
            "UV Index",
            weather.loading ? (
              <span style={{ color: "#888" }}>...</span>
            ) : weather.uvIndex == null ? (
              <span style={{ color: "#ff6b6b" }}>ERR</span>
            ) : (
              <span style={{ color: AMBER, fontWeight: 700 }}>{Math.round(weather.uvIndex)}</span>
            ),
            weather.uvIndex != null && !weather.loading ? uvDescriptor(weather.uvIndex) : null,
          )}

          {/* AQI */}
          {row(
            "aqi",
            "Air Quality",
            weather.loading ? (
              <span style={{ color: "#888" }}>...</span>
            ) : weather.aqiUs == null ? (
              <span style={{ color: "#ff6b6b" }}>ERR</span>
            ) : (
              <span style={{ color: AMBER, fontWeight: 700 }}>{Math.round(weather.aqiUs)}</span>
            ),
            weather.aqiUs != null && !weather.loading ? aqiDescriptor(weather.aqiUs) : null,
          )}

          {/* Pressure */}
          {row(
            "pressure",
            "Pressure",
            readout(displayPressure(weather.pressureHpa, unitSystem), { decimals: displayPressure(1000, unitSystem)?.unit === " inHg" ? 2 : 0 }),
            pressureTrend
              ? `${trendArrow} ${pressureTrend}`
              : null,
          )}

          {/* Footer: unit system strip */}
          <div
            style={{
              marginTop: "6px",
              paddingTop: "5px",
              borderTop: `1px solid ${AMBER_FAINT}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "7px",
              color: "rgba(255,157,0,0.35)",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              fontFamily: MONO,
            }}
          >
            <span>Telemetry link active</span>
            <span>{unitSystem === "metric" ? "SI units" : "US units"}</span>
          </div>
        </>
      )}
    </div>
  );
}
