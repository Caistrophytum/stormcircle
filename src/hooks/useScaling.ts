import { useEffect } from "react";

/**
 * useViewportScaling — proportionally scales the app's root font size based
 * on viewport width relative to a 1440px base design. Only active on
 * desktop/landscape (>=1024px). Scale is clamped to [0.6, 1.4] to prevent
 * extreme distortion. Borders, border-radius, and box-shadows defined in px
 * are intentionally unaffected.
 */
export function useViewportScaling() {
  useEffect(() => {
    const BASE_WIDTH = 1440;

    function applyScale() {
      const width = window.innerWidth;
      // Only apply on desktop/landscape (1024px+)
      if (width < 1024) return;
      const scale = width / BASE_WIDTH;
      // Clamp scale between 0.6 and 1.4 to prevent extreme distortion
      const clamped = Math.min(Math.max(scale, 0.6), 1.4);
      document.documentElement.style.fontSize = `${clamped * 16}px`;
    }

    applyScale();
    window.addEventListener("resize", applyScale);
    return () => window.removeEventListener("resize", applyScale);
  }, []);
}
