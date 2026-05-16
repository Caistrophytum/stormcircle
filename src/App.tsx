/**
 * App.tsx — top-level providers + routing. Mobile (<1024px) renders a
 * dedicated MobileLayout on "/"; all other routes are shared across devices.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useViewportScaling } from "@/hooks/useScaling";
import { useMobile } from "@/hooks/useMobile";
import MobileLayout from "@/components/mobile/MobileLayout";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import AccountCenter from "./pages/AccountCenter.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import FAQ from "./pages/FAQ.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => {
  useViewportScaling();
  const isMobile = useMobile();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={isMobile ? <MobileLayout /> : <Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/account" element={<AccountCenter />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/faq" element={<FAQ />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
