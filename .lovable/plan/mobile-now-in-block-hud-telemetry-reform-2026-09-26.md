# Mobile "Now in" block: HUD telemetry reform

## Goal

Replace the dense wrapped-text "Now in [hometown]" conditions block at the top of the
mobile main screen with a visual, one-line-per-parameter HUD telemetry card, following
the approved "Avionics HUD telemetry" direction (v3): amber left border, subtle amber
gradient fill, corner bracket accent, pulsing status dot in the header, and rows of
label / value / wording readouts in JetBrains Mono on the obsidian background.

## Data changes

`src/hooks/useHometownWeather.ts`

- Add a second, cached fetch to the Open-Meteo air quality endpoint
  (`current=us_aqi`) for the same hometown coordinates, reusing `fetchJsonCached`
  so it dedupes with the existing 4-minute shared cache.
- New field `aqiUs: number | null` on `HometownWeather`; null when unavailable.
- No new polling cadence: it rides the existing 60-second refresh tick.

## New component

`src/components/mobile/HometownConditions.tsx` (replaces the inline block in
`MobileMain.tsx`, lines ~490-653, which currently holds all the descriptor logic).

Structure per the selected prototype:

- Header: "Current conditions" eyebrow + "NOW IN [CITY]" with pulsing amber dot.
- Rows, one line per parameter, label left / value right with the small leader dash:
  1. Temp // Dew - large combined readout, both values with units (US/SI aware).
  2. Real Feel - value + wording (existing Cold..Extreme Heat thresholds).
  3. Wind - value + new Beaufort-scale wording helper
     (Calm, Light Air ... Storm, Violent Storm, Hurricane Force), based on the
     km/h source value, displayed via the shared unit toggle.
  4. UV - value + existing None..Extreme wording.
  5. AQI - US AQI value + category wording (Good, Moderate, Unhealthy for
     Sensitive Groups, Unhealthy, Very Unhealthy, Hazardous).
  6. Pressure - value + trend arrow (rising/falling/steady) + existing
     3-hour trend wording (Falling Sharply..Climbing Sharply).
- Wording chips get severity color accents (green for calm/good, amber mid,
  red for dangerous readings); values stay neon amber per the prototype.
- Per-parameter loading ("...") and ERR states, exactly as today.
- Signed-out and no-hometown states keep the existing guidance messages.
- Compact footer strip with the active unit system label (US / SI).
- All units render through `useUnitSystem` helpers (displayTemp,
  displayWindSpeed, displayPressure); AQI and UV stay dimensionless.

## Wiring

`src/components/mobile/MobileMain.tsx`

- Swap the inline block for `<HometownConditions>`; delete the inline descriptor
  functions that move into the new component or a small shared helper module.
- Everything below the block (SPC risk strip, fire strip, rest of screen) is
  untouched.

## Constraints

- No backend, routing, or navigation changes; the only new network call is the
  cached AQI lookup.
- Dark theme only; amber #ff9d00 on obsidian, JetBrains Mono data font.
- No em dashes in code or user-facing text.
