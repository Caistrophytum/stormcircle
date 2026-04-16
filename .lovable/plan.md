

## Plan: Add Event Information Overlays to Image Screen

### What We're Building
Two new glass-panel overlays on the image screen (TacticalMap):
1. **Top 5 Hazards** — ranked list showing hazard type + alert count (e.g., "THUNDERSTORM — 247 alerts")
2. **Top 3 Most Dangerous Alerts** — ranked list showing the most severe active alerts with severity badge

Both panels will use the existing `glass-panel` styling, `font-mono` text, severity color system, and will scale with `overlayScale` like all other map overlays.

### Layout Placement
- **Top 5 Hazards**: Top-right area, below the weather condition selector buttons, anchored with `origin-top-right`
- **Top 3 Dangerous Alerts**: Right side, vertically centered or below the hazards panel, also `origin-top-right`

Both panels will be compact (similar width to `RadarCodePanel` ~224px) to avoid obstructing the background.

### Data
Static mock data for now, styled to match the avionics aesthetic:

**Top 5 Hazards:**
| # | Hazard | Alerts |
|---|--------|--------|
| 1 | THUNDERSTORM | 247 |
| 2 | FLOOD | 183 |
| 3 | WIND | 156 |
| 4 | TORNADO | 89 |
| 5 | HAIL | 74 |

**Top 3 Most Dangerous:**
| # | Alert | Severity |
|---|-------|----------|
| 1 | EF4 TORNADO — Oklahoma | EMERGENCY |
| 2 | FLASH FLOOD — Houston | WARNING |
| 3 | DERECHO — Illinois | WARNING |

### Technical Details

1. **New component**: `src/components/EventInfoPanel.tsx`
   - Two sections in one glass-panel or two stacked panels
   - Severity badges using existing CSS vars (`--severity-watch`, `--severity-warning`, `--severity-emergency`)
   - Numbered rankings with monospace styling
   - Compact layout with `text-[9px]` to `text-xs` sizing

2. **Edit**: `src/components/TacticalMap.tsx`
   - Import and render `EventInfoPanel`
   - Position absolute top-right, below weather buttons
   - Apply `overlayScale` transform with `origin-top-right`

