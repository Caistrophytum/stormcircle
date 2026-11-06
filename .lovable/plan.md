# WRS 24-hour forecast slider

Yes, this is possible. Every value the Weather Risk Score uses today (CAPE, CIN, Lifted Index, boundary layer height, temperature/dew point, 700 hPa humidity, lapse rate, 850/500 hPa winds) is also published by Open-Meteo as an hourly forecast, so the score can be recomputed for any of the next 24 hours with the exact same formula.

## What the user sees
- A slider directly under the WRS block (desktop and mobile).
- Left end: "Now" (live score, as today). Right end: "+24h". Steps of 1 hour.
- While dragging, the circle, the score and every parameter row update to the simulated values for that hour, with a label like "+6h · 22:00 local" and a "Forecast" tag so it is clear this is not the live reading.
- Releasing back at "Now" (or tapping a small "Now" reset) returns to live values.
- Changing city/hometown resets the slider to "Now".

## How it works
- One extra request per location, only when the user first touches the slider (no new background polling). Cached for 30 minutes, shared between desktop and mobile through the existing cache.
- Request asks Open-Meteo for the same variables as `hourly` with `forecast_hours=25`.
- For each hour, build the same sounding shape the live score uses and run it through the shared scoring model, so desktop, mobile and live/forecast can never disagree.
- Only the WRS block changes; the map, warnings, notifications and other panels stay on live data.

## Technical details
- `src/hooks/useSoundingData.ts`: extract the per-hour parsing (lapse rate, bulk shear vector, picks) into a pure `parseSoundingAt(json, index)` so live and forecast share it.
- New `src/hooks/useSoundingForecast.ts`: lazy, enabled flag, `fetchJsonCached` with 30 min TTL, returns 25 parsed soundings keyed to the location; uses the existing dedupe/deadline fetch path.
- New `src/components/WRSForecastSlider.tsx`: shadcn `Slider` (0 to 24), semantic tokens, mono labels.
- `useWRSMetrics` and `MobileWRSPanel`/`MobileMain`: accept an optional hour offset; when > 0 feed the forecast sounding to `computeWRS` instead of the live one.
- Add a small test that `parseSoundingAt(json, 0)` matches the live parser output and that offset 0 shows the live score.
- Record the shared-parser rule in `AGENTS.md`.

## Caveat
Hourly model values are forecasts, not observations, so the simulated score is a guide; the live "Now" value stays the authoritative one.
