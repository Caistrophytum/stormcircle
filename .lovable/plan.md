

## Plan: Add WRS contribution triangles to data nodes

### What
Add a right-pointing triangle on the right edge of each data node box (CAPE, CIN, SHEAR, SRH, LCL), colored neon white, displaying the score that variable contributes to the total WRS.

### Changes

**1. `src/hooks/useWeatherData.ts`**
- Compute each variable's individual WRS contribution and add it to the data node objects:
  - CAPE: `(cape/5000) * 35`
  - CIN: `cinScore * 8`
  - SHEAR: `(shear/50) * 20`
  - SRH: `(srh/600) * 25`
  - LCL: `lclScore * 12`
- Add a `wrsContribution: number` field to each data node entry.
- Update the `WeatherData` interface accordingly.

**2. `src/components/TacticalMap.tsx`**
- For each data node, add a CSS triangle (using `clip-path: polygon(0 0, 100% 50%, 0 100%)`) positioned on the right side of the box, extending outward.
- The triangle will be neon white (`bg-white` or a custom neon-white color).
- Inside the triangle, display the rounded WRS contribution number, styled small and dark for contrast.
- Each node's container becomes `relative` with `overflow-visible` so the triangle can extend beyond.

**3. `src/index.css`** (if needed)
- Add a `--neon-white` CSS variable if not already present.

