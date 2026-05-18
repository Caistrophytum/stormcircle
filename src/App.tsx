/**
 * App.tsx — top-level providers + routing.
 *
 * Routes are split with React.lazy so opening /auth doesn't have to download
 * Leaflet / the radar / the tactical map first. This was the dominant cause
 * of the slow "click Login → page finally appears" experience.
 */
import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useViewportScaling } from "@/hooks/useScaling";
import { useMobile } from "@/hooks/useMobile";

const Index = lazy(() => import("./pages/Index.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const AccountCenter = lazy(() => import("./pages/AccountCenter.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const FAQ = lazy(() => import("./pages/FAQ.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const MobileLayout = lazy(() => import("@/components/mobile/MobileLayout"));

const queryClient = new QueryClient();

// Cheap, theme-matching fallback so route transitions never flash white.
const RouteFallback = () => (
  <div className="min-h-screen bg-background text-foreground" aria-hidden />
);

const App = () => {
  useViewportScaling();
  const isMobile = useMobile();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={isMobile ? <MobileLayout /> : <Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/account" element={<AccountCenter />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/faq" element={<FAQ />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
