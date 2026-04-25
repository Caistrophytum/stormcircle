# Lock Top 6 Most Dangerous height to match left stack

## Goal

The Top 6 Most Dangerous panel (top-right of map) should have its bottom edge land at the same y-position as the bottom of the New Warnings panel (left side). When its content exceeds that height, the panel scrolls internally instead of pushing further down.

Currently both panels are independently sized and the cap I added uses a viewport-relative formula (`100% - 9.5rem`). That's predictable but not "match the left stack exactly."

## Behavior

- Measure the rendered height of the left stack (Top 5 Hazards card + 8px gap + New Warnings card) at runtime.
- Apply that exact height as `maxHeight` on the Top 6 panel wrapper.
- The Top 6 panel scrolls vertically inside that bound; outer page never scrolls.
- Re-measure on:
  - viewport resize (shrinking/growing changes wrap and font scale)
  - left-stack content changes (alert counts update on a refresh interval)

## Technical changes

**`src/components/TacticalMap.tsx`**

1. Replace the two independent `EventInfoPanel` mounts (`show="hazards"` and `show="dangerous"`) with refs:
   - `leftStackRef` on the top-left wrapper.
   - `dangerousWrapperRef` on the top-right wrapper.
2. Add a `useState<number | null>` for `lockedHeight`.
3. Add a `ResizeObserver` on `leftStackRef` that writes its `offsetHeight` into `lockedHeight`. Also re-runs on window resize.
4. Apply to top-right wrapper:
   ```ts
   style={{
     transform: `scale(${overlayScale})`,
     maxHeight: lockedHeight ? `${lockedHeight / overlayScale}px` : undefined,
   }}
   className="... overflow-y-auto overflow-x-hidden no-scrollbar"
   ```
   Dividing by `overlayScale` keeps the **post-scale** rendered height equal to the left stack (which uses the same `overlayScale`).
5. Remove the previous `100% - 9.5rem` cap — replaced by this measured value.
6. Keep `overflow-y-auto` so the panel scrolls internally; keep `overflow-x-hidden` so badges don't horizontally scroll.

**`src/components/EventInfoPanel.tsx`** — no changes required; it already renders inside whatever wrapper it's given.

## Edge cases

- **First paint**: `lockedHeight` is `null` until the ResizeObserver fires (next frame). Until then the right panel is uncapped — same as today. Acceptable; the cap snaps in within ~1 frame.
- **Left stack grows after Top 6 is already small**: ResizeObserver fires, `lockedHeight` increases, right panel cap relaxes — no scroll needed.
- **Hazards data still loading**: left stack is shorter, so right panel cap is shorter too. Right panel scrolls. Once data loads, cap expands.
- **Very narrow viewport (overlayScale < 1)**: both wrappers are scaled by the same factor, so visually they stay aligned at the bottom.

## What stays the same

- Both panels remain independently positioned (`top-3 left-3` and `top-3 right-3`).
- Sounding parameter strip and WRS bar positions are unchanged.
- No styling/visual changes inside `EventInfoPanel`.

## Out of scope

- Top 5 Hazards / New Warnings panels themselves (already sized by content; not capped).
- Mobile guard, viewport scaling hook — unchanged.
