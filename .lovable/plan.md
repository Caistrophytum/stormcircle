# Mobile WRS panel redesign

## Goal

Replace the three separate mobile WRS sections with one compact avionics-style panel directly below Current Conditions. Desktop remains unchanged.

## Mobile layout

- Add a single WRS panel immediately after the Current Conditions card and before the risk strips, hazards, and bot messages.
- Build a top summary row with “Weather Risk Score:” on the left and the circular desktop-style WRS meter on the top right.
- Match the label block’s height to the meter so the summary reads as one balanced row.
- Reuse the desktop meter behavior: color-changing score ring, centered numeric score and WRS label, plus the blue 60-second countdown ring and seconds readout.

## Parameter menus

- Place two full-width collapsible menus below the score summary:
  1. Virtual Parameters
  2. Physical Parameters
- Use clear chevrons and accessible expanded/collapsed states; keep both categories available independently.
- Preserve the existing mobile parameter cards, values, units, contribution percentages, primary indicators, severity colors, and “Scaled to” information inside their respective menus.
- Keep loading, missing-station, and error states unchanged.

## Code structure

- Extract the mobile WRS presentation into a focused `MobileWRSPanel` component so the already-large main mobile screen only supplies the computed WRS data and location metadata.
- Reuse `SyncShellCircle` and `SyncSeconds` rather than introducing another timer.
- Remove the old standalone Virtual Metrics, Physical Metrics, and horizontal WRS bar sections after the replacement is wired.
- Keep all WRS calculations and US/SI conversion behavior in the existing shared model without changing scoring logic.

## Validation

- Check the signed-out placeholder state and an authenticated city/station state on a phone-sized viewport.
- Confirm both menus expand and collapse independently, the meter updates without shifting layout, bots remain below the new panel, and no desktop UI changes.
- Confirm the preview builds without errors.
