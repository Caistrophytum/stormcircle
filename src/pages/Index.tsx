import { lazy, Suspense } from "react";
import { Helmet } from "react-helmet-async";
import StatusBar from "@/components/StatusBar";
import DesktopDock from "@/components/desktop/DesktopDock";
import FloatingChat from "@/components/desktop/FloatingChat";
import { CityProvider } from "@/contexts/CityContext";
import { RadarProvider } from "@/contexts/RadarContext";

const TacticalMap = lazy(() => import("@/components/TacticalMap"));
const MapFallback = () => <div className="w-full h-full bg-background" aria-hidden />;

const Index = () => {
  return (
    <>
      <Helmet>
        <title>StormCircle — Weather Social Network for Meteorologists</title>
        <meta name="description" content="StormCircle connects meteorologists and the public for real-time storm reporting, weather communication, and meteorological information sharing." />
        <link rel="canonical" href="https://stormcircle.net/" />
        <meta property="og:title" content="StormCircle — Weather Social Network" />
        <meta property="og:description" content="Real-time storm reports, meteorologist verified alerts, and community weather communication." />
        <meta property="og:url" content="https://stormcircle.net/" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://stormcircle.net/og-image.png" />
      </Helmet>

      <h1 className="sr-only">StormCircle — Real-time Meteorological Network</h1>
      <CityProvider>
        <RadarProvider>
          <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
            <StatusBar />
            <main className="relative flex flex-1 overflow-hidden">
              <Suspense fallback={<MapFallback />}>
                <TacticalMap overlayScale={1} />
              </Suspense>

              {/* Bottom-right floating dock + chat */}
              <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex items-stretch gap-3">
                <DesktopDock />
                <FloatingChat />
              </div>
            </main>
          </div>
        </RadarProvider>
      </CityProvider>
    </>
  );
};

export default Index;
