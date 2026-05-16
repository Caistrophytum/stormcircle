# Mobile layout — implementation plan

Replace the MobileGuard "rotate your device" block with a real mobile UI for screens < 1024px. Desktop layout is unchanged.

## 1. Mobile detection
- Delete `src/components/MobileGuard.tsx` and remove its wrapper from `src/App.tsx`.
- Create `src/hooks/useMobile.ts` — listens on resize, returns `window.innerWidth < 1024`.
- `App.tsx` renders `<MobileLayout />` when mobile, otherwise the current desktop tree (Toaster/Sonner/TooltipProvider/BrowserRouter with all existing routes). Both branches keep `useViewportScaling()`.

## 2. Layout skeleton
Create `src/components/mobile/MobileLayout.tsx` — full viewport (`100dvw` × `100dvh`), three stacked zones:
- 10% `MobileHeader` (logo, UTC mission time, online count)
- 40% `MobileAlerts` (top 10 most dangerous)
- 50% `MobileHazards` (10 most common + 5 new alerts)
- Floating `MobileFloatingButtons` (account / chat / alerts / radar) with a toggle arrow
- `MobileScreen` overlay rendered when an action is active

## 3. Sub-components
- `MobileHeader.tsx` — uses `useAlerts` and `useOnlineCount`.
- `MobileAlerts.tsx` — renders `mostDangerous` with severity pill + area, colored left border via `getWarningColor`.
- `MobileHazards.tsx` — top half = `topHazards` (count badge), bottom half = recent/new alerts list.
- `MobileFloatingButtons.tsx` — four circular buttons + persistent toggle chevron, lucide icons.
- `MobileScreen.tsx` — full-screen overlay with a 10dvh header (title + close button) and a content slot.

## 4. Adjustments to existing code
- **`src/hooks/useAlerts.ts`**: today exposes `mostDangerous` (top 10 already), `topHazards`, and `newWarnings` (aggregated counts). The plan needs a per-alert recent list, so add `recentAlerts: Alert[]` — the alerts whose ids first appeared in the last `REFRESH_HISTORY_WINDOW` cycles, newest first, capped at e.g. 10. `mostDangerous` already returns 10 — no change needed there.
- **`MobileScreen` content wiring**:
  - `account` → render `<AccountCenter />` inside the overlay.
  - `radar` → render `<RadarMiniMap expanded onCollapse={onClose} … />` with the full required prop set (selectedCity/setSelectedCity, selectedStation/setSelectedStation, onStationMarkerSelect, stationDistanceKm, selectedProduct/setSelectedProduct, tileUrl) sourced from `useRadar()`. Inside `RadarMiniMap`, hide the existing collapse button on mobile (use `useMobile`) since the screen header's close button replaces it.
  - `alerts` → scrollable full list rendered from `useAlerts().mostDangerous` + topHazards/recentAlerts (reuse the card styling from `MobileAlerts`).
  - `chat` → no `PublicChat` component exists in this codebase. Options: (a) ship a placeholder "Coming soon" panel, or (b) drop the chat button for now. Recommendation: ship placeholder so the four-button grid stays intact.

## 5. Routes
`/auth`, `/account`, `/reset-password`, `/faq`, `*` still need to work on mobile. Simplest approach: keep `BrowserRouter` + `Routes` in both branches; on mobile, the `/` route renders `MobileLayout` and the other routes render their existing pages (already mobile-friendly enough to view; account overlay just deep-links into `/account` if preferred).

## Technical notes
- Inline styles in the snippets use hardcoded hex values (`#0a0a14`, `#7dd3fc`, …). These don't match the project's HSL token system but match the user's pasted code verbatim — kept as-is unless you want them refactored to design tokens later.
- `dvh` is used intentionally for iOS Safari address-bar behavior.
- No new dependencies; lucide-react and existing hooks cover everything.

## Open question
Chat overlay: placeholder panel, or remove the chat button until a chat component exists?
