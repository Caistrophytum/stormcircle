

## Plan: Reposition toggle buttons and bottom panel tabs

### What changes

1. **Move toggle buttons to bottom-right** (`src/pages/Index.tsx`)
   - Change `left-4` → `right-4` on the button container
   - Change `origin-bottom-left` → `origin-bottom-right`

2. **Move bottom panel menu (tabs) to the left** (`src/components/IntegrationPanel.tsx`)
   - The tab bar (HAZCAM, TRAFFIC, NETWORK) will be left-aligned instead of centered/right-aligned — need to check current alignment and adjust with `justify-start` or similar.

### Technical details

**File: `src/pages/Index.tsx`**
- Line 44: `left-4` → `right-4`, `origin-bottom-left` → `origin-bottom-right`

**File: `src/components/IntegrationPanel.tsx`**
- Locate the tab bar container and change its alignment to left (`justify-start` or similar)

