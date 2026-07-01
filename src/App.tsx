/**
 * App.tsx — top-level providers + routing.
 *
 * Routes are split with React.lazy so opening /auth doesn't have to download
 * Leaflet / the radar / the tactical map first. This was the dominant cause
 * of the slow "click Login → page finally appears" experience.
 */
import { lazy, Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useViewportScaling } from "@/hooks/useScaling";
import { useMobile } from "@/hooks/useMobile";

/**
 * Wrap React.lazy so a stale hashed chunk (after a redeploy) doesn't leave the
 * user on a blank screen. On the first "Failed to fetch dynamically imported
 * module" error we force a one-shot hard reload; a sessionStorage flag prevents
 * an infinite reload loop if the failure is genuine (offline, 404, etc.).
 */
function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  key: string,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const isChunkErr =
        msg.includes("Failed to fetch dynamically imported module") ||
        msg.includes("Importing a module script failed") ||
        msg.includes("error loading dynamically imported module");
      const flag = `lazy-retry:${key}`;
      if (isChunkErr && typeof window !== "undefined" && !sessionStorage.getItem(flag)) {
        sessionStorage.setItem(flag, "1");
        window.location.reload();
        // Return a never-resolving promise while the reload happens.
        return await new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

const Index = lazyWithRetry(() => import("./pages/Index.tsx"), "Index");
const Auth = lazyWithRetry(() => import("./pages/Auth.tsx"), "Auth");
const AccountCenter = lazyWithRetry(() => import("./pages/AccountCenter.tsx"), "AccountCenter");
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword.tsx"), "ResetPassword");
const FAQ = lazyWithRetry(() => import("./pages/FAQ.tsx"), "FAQ");
const NotFound = lazyWithRetry(() => import("./pages/NotFound.tsx"), "NotFound");
const MobileLayout = lazyWithRetry(() => import("@/components/mobile/MobileLayout"), "MobileLayout");

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
