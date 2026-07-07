import { forwardRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import HazardTabs from "./desktop/HazardTabs";
import { useWRSMetrics, type WeatherCondition } from "@/hooks/useWRSMetrics";
import { useDataContext } from "@/providers/DataProvider";

const weatherBackgrounds: Record<WeatherCondition, string> = {
  sunny: new URL("../assets/weather-calm.jpg", import.meta.url).href,
  cloudy: new URL("../assets/weather-overcast.jpg", import.meta.url).href,
  rainy: new URL("../assets/weather-rainy.jpg", import.meta.url).href,
  stormy: new URL("../assets/weather-stormy.jpg", import.meta.url).href,
};

interface Props {
  overlayScale?: number;
}

const TacticalMap = forwardRef<HTMLElement, Props>((_props, ref) => {
  const { weatherCondition } = useWRSMetrics();
  const { appReady } = useDataContext();
  const [loadingTooLong, setLoadingTooLong] = useState(false);

  useEffect(() => {
    if (appReady) {
      setLoadingTooLong(false);
      return;
    }
    const t = setTimeout(() => setLoadingTooLong(true), 10_000);
    return () => clearTimeout(t);
  }, [appReady]);

  return (
    <motion.section ref={ref} layout className="relative overflow-hidden flex-1">
      <AnimatePresence mode="wait">
        <motion.img
          key={weatherCondition}
          src={weatherBackgrounds[weatherCondition]}
          alt={`${weatherCondition} weather`}
          className="absolute inset-0 w-full h-full object-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          width={1600}
          height={900}
          decoding="async"
          // @ts-expect-error fetchpriority is not in React types yet
          fetchpriority="high"
        />
      </AnimatePresence>

      <div className="absolute inset-0 bg-background/15" />

      {loadingTooLong && !appReady && (
        <div
          className="absolute z-50 left-1/2 -translate-x-1/2 top-3 px-3 py-1.5 rounded glass-panel pointer-events-none"
          style={{ color: "#ff6b6b", fontSize: "10px", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.05em" }}
        >
          TAKING LONGER THAN USUAL — RECOVERING…
        </div>
      )}

      <LeftRightHazardOverlays overlayScale={overlayScale} />
    </motion.section>
  );
});

TacticalMap.displayName = "TacticalMap";

export default TacticalMap;

const PANEL_GAP = 12;

function LeftRightHazardOverlays({ overlayScale }: { overlayScale: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const commonRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLDivElement>(null);
  const dangerousRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const GAP = PANEL_GAP;
    const RATIO = 0.405;

    function recalculate() {
      const parent = containerRef.current?.offsetParent as HTMLElement | null;
      const availableH = parent?.offsetHeight ?? window.innerHeight;
      const combinedH = Math.floor(availableH * RATIO);
      const panelH = Math.max(0, Math.floor((combinedH - GAP) / 2));

      if (commonRef.current) {
        commonRef.current.style.height = `${panelH}px`;
        commonRef.current.style.maxHeight = `${panelH}px`;
      }
      if (newRef.current) {
        newRef.current.style.height = `${panelH}px`;
        newRef.current.style.maxHeight = `${panelH}px`;
      }
      if (dangerousRef.current) {
        dangerousRef.current.style.height = `${combinedH}px`;
        dangerousRef.current.style.maxHeight = `${combinedH}px`;
      }
    }

    const parent = containerRef.current?.offsetParent as HTMLElement | null;
    const observer = new ResizeObserver(recalculate);
    if (parent) observer.observe(parent);
    recalculate();
    return () => observer.disconnect();
  }, []);

  const scrollStyle: React.CSSProperties = {
    overflowY: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(100, 200, 255, 0.3) transparent",
  };
  const leftPanelStyle: React.CSSProperties = { ...scrollStyle, flexShrink: 0, minHeight: 0 };
  const dangerousStyle: React.CSSProperties = { ...scrollStyle, flexShrink: 0, minHeight: 0 };

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 pointer-events-none" aria-hidden />
      <div
        className="absolute top-3 left-3 z-10 origin-top-left transition-all duration-300 ease-in-out"
        style={{ transform: `scale(${overlayScale})` }}
      >
        <EventInfoPanel
          show="hazards"
          hazardsRef={commonRef}
          newWarningsRef={newRef}
          hazardsStyle={leftPanelStyle}
          newWarningsStyle={leftPanelStyle}
          stackGapPx={PANEL_GAP}
        />
      </div>
      <div
        className="absolute top-3 right-3 z-10 origin-top-right transition-all duration-300 ease-in-out"
        style={{ transform: `scale(${overlayScale})` }}
      >
        <EventInfoPanel show="dangerous" dangerousRef={dangerousRef} dangerousStyle={dangerousStyle} />
      </div>
    </>
  );
}
