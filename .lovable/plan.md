# StormCircle Desktop UI Overhaul — Plan

Scope: desktop layout only (mobile files under `src/components/mobile/*` untouched). The map remains full-screen background; all UI becomes floating glassy panels on top.

## 1. Layout restructure (`src/pages/Index.tsx`)

Remove the current `flex` layout with `LeftSidePanel` + `CitizenReports` side columns and their two toggle buttons. New structure:

```text
┌─────────────────────────────────────────────────────────┐
│ StatusBar (unchanged, top)                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  TacticalMap (full-bleed background)                    │
│                                                         │
│   ┌──────────────────────────┐  ┌──────────────────┐   │
│   │ Tab dock (4 tabs)        │  │                  │   │
│   │ [Metrics|Situation|Bots| │  │  Chat panel      │   │
│   │  Radar & Reports]        │  │  (square,        │   │
│   │                          │  │   glassy,        │   │
│   │ Active tab content       │  │   lower-right)   │   │
│   └──────────────────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

- Chat panel: fixed bottom-right, ~380×380px square, glassy dark-gray, border flashes white on new message (hook into existing `useNewReportPing`).
- Tab dock: fixed to the left of chat, ~420×440px glassy panel with 4 top-tab buttons and content area below.
- Delete the `PanelLeftOpen/Close`, `PanelRightOpen/Close` toggles and the `leftOpen`/`rightOpen` state.

## 2. New components

Create under `src/components/desktop/`:

- `FloatingChat.tsx` — square glassy CitizenReports variant; reuses existing chat data/hooks from `CitizenReports.tsx` but with a compact layout and border-flash animation on `useNewReportPing`.
- `TabDock.tsx` — container with 4 tabs and a floating-window portal for expanded views.
- `tabs/MetricsTab.tsx` — WRS circle + physical line + virtual boxes.
- `tabs/SituationTab.tsx` — convective / fire / hazards stack + exercise button.
- `tabs/BotsTab.tsx` — grid of bot buttons; opens floating window per bot.
- `tabs/RadarReportsTab.tsx` — radar preview square + reports feed.
- `FloatingWindow.tsx` — reusable modal-style floating panel (matches existing `ExerciseComfort` overlay style) used by expanded radar, expanded bot messages, and exercise.

## 3. Tab 1 — Hometown Metrics

Reuse data from `useHomeCityRisk` / `useExerciseComfortData`.

- **WRS circle**: SVG conic/radial fill circle. Color interpolates through a neon gradient (green→amber→red) based on score using HSL interpolation with CSS transitions. Score number centered on top.
- **Physical Parameters line**: horizontal stacked bar; each parameter is a segment colored by its own neon token, width = its % contribution to the physical score. Segments animate width changes with `transition: width 600ms ease`.
- **Virtual Parameters**: keep current visual boxes from `ExerciseComfort` but with `rounded-xl`, glassy bg, glow border. Placed below the line.

## 4. Tab 2 — Hometown Situation

- Order: convective outlook (from `useSPCOutlook`) → fire risk (from `useHomeCityFireRisk`) → current hazards (from `CurrentLocationHazards` data).
- Each section is a glassy neon card; empty sections render `null` so lower ones shift up naturally via flex.
- If all three are empty: single centered message "Situation's Calm Here."
- Exercise button (currently floating in `ExerciseComfort`) moves here, placed above bot messages area (bot messages moved out to Tab 3).

## 5. Tab 3 — Bot Network

- Extract bot messages from `CitizenReports.tsx` (currently interleaved). Filter chat by `role/user_id` matching known bots (Convective Weather Bot, Hurricane Weather Bot, ENSO Bot, etc.).
- Grid of rounded-square bot buttons, each with icon + name.
- Click → opens `FloatingWindow` showing that bot's messages in larger font.

## 6. Tab 4 — Radar & Weather Reports

- Left: rounded-square radar preview using existing `RadarMiniMap` at reduced size. Click → opens `FloatingWindow` with full radar (`RadarMiniMap` at large size + search bar + station name up top + scan-type selector list down the left).
- Right: weather reports feed — LSR / station reports (from `useLSR` + station report queries currently in `CitizenReports`).

## 7. Visual language (global)

Add to `src/index.css`:

- `.glass` — `bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_0_24px_rgba(0,0,0,0.6)]`.
- `.neon-edge` — subtle animated inset + outer glow using `box-shadow` on the primary neon tokens; supports color variants via CSS var `--glow-color`.
- `@keyframes border-flash-white` used by chat panel on new-message ping.
- Global transitions: bump default `transition-colors`/`transition-all` durations to 400-600ms where values change (scores, colors on WRS circle, bar segments).
- Reuse existing `--neon-amber/green/red/blue` tokens; add `--neon-violet` and `--neon-cyan` for extra parameter coloring.

## 8. Cleanup

After migration:
- `LeftSidePanel.tsx`, `IntegrationPanel.tsx`, the old side-panel toggle wiring in `Index.tsx` — remove imports and delete unused files.
- `ExerciseComfort` floating trigger button removed; the panel itself (floating window) remains, triggered from Tab 2.
- `CitizenReports.tsx` split: chat lives in `FloatingChat`, station/LSR feed lives in Tab 4, bot messages live in Tab 3. Original file deleted or reduced to shared hooks.

## Open questions (need answers before build)

1. **Tab dock position**: should the dock sit flush against the chat (chat at bottom-right, dock immediately to its left, both bottom-aligned)? Or dock centered vertically on the left/middle while chat stays bottom-right?
2. **Chat panel size**: strict square ~380×380, or should it scale with viewport (e.g. `min(30vw, 420px)`)?
3. **Bot identification**: is there a `bot_type` / `is_bot` field on messages, or should I filter by known bot display names? (I'll check the messages schema — flag if you know off-hand.)
4. **Physical Parameters colors**: any preferred mapping (temp=red, wind=cyan, humidity=blue, UV=violet, AQ=green, precip=amber)? Or free choice?

Once you confirm, I'll implement in one pass.
