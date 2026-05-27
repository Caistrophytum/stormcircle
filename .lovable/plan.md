
## Goal

Move bot/system messages (SPC Bot, Hurricane Bot) out of the chat feed and into the desktop **left** side menu, alongside the existing Professional Weather Reports — both as collapsible sections. Mobile keeps bot cards on the main screen and loses them from the chat overlay.

## Changes

### 1. New `src/components/LeftSidePanel.tsx`

Replaces `IntegrationPanel` as the content of the desktop left drawer. Renders two foldable sections (chevron headers, click to expand/collapse, both open by default):

- **Bot Messages** — fetches the latest System-badge messages (same query CitizenReports used: `badge = "System"`, latest 10, deduped by `user_id + issue marker`). Subscribes to realtime INSERT/DELETE on `messages` for system rows. Renders each with `SystemMessageCard` (reused as-is). Also shows the SPC "refreshing…" placeholder using `useSPCOutlookLoading()`.
- **Professional Weather Reports** — the existing `IntegrationPanel` body (LSR list), moved into a section. The current `IntegrationPanel.tsx` becomes the inner content (can be left as-is and imported, or inlined — I'll keep `IntegrationPanel` as the inner LSR list to minimize churn).

Each section header: small JetBrains Mono uppercase title with chevron, primary-tinted border, matches existing avionics styling. Sections scroll independently inside the 280px-wide drawer.

### 2. `src/pages/Index.tsx`

Swap the import/usage `IntegrationPanel` → `LeftSidePanel` in the left `AnimatePresence` drawer. No other layout changes.

### 3. `src/components/CitizenReports.tsx` — remove system messages

- Drop the `systemMessages` derivation, `SystemMessageCard` rendering, and the `spcLoading` placeholder block.
- Drop the second supabase query for System messages in `reloadMessages` (keep only the recent non-System fetch; the existing `.neq("badge","System")` already filters them out, so just remove the parallel system query and the merge logic).
- Remove imports for `SystemMessageCard` and `useSPCOutlookLoading`.
- Simplify the empty state check to `stacks.length === 0`.
- Keep everything else (composer, approvals, realtime for user messages, etc.) untouched.

This single change satisfies both the desktop right panel and the mobile chat overlay (which mounts `CitizenReports`).

### 4. Mobile main screen — no change

`MobileMain` already renders SPC + Hurricane bot cards via its own `useSPCBotMessage` / `useHurricaneBotMessage` hooks. Untouched.

## Technical notes

- Bot data fetch in `LeftSidePanel` mirrors the existing CitizenReports logic verbatim (same dedupe by `user_id::issue`), so behavior is preserved — just relocated.
- `SystemMessageCard` already accepts an `expandedKey: Set<string>` / `toggle` pair for per-group dropdowns; `LeftSidePanel` will own that local state.
- Realtime channel name uses the same `Math.random + Date.now` pattern to avoid StrictMode collisions.
- No DB / RLS / edge function changes required.

## Files touched

- **new** `src/components/LeftSidePanel.tsx`
- **edit** `src/pages/Index.tsx` (one import + one JSX swap)
- **edit** `src/components/CitizenReports.tsx` (remove system-message paths)
- `src/components/IntegrationPanel.tsx` reused as-is (rendered inside the Reports section of `LeftSidePanel`)
