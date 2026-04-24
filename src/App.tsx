/**
 * App.tsx — top-level component that wires together every cross-cutting
 * concern shared by every page: data fetching, tooltips, toasts, and routing.
 *
 * Provider stack (outer → inner):
 *   QueryClientProvider — TanStack Query's cache for any useQuery/useMutation
 *   TooltipProvider     — Radix tooltip context (required for any <Tooltip>)
 *   Toaster + Sonner    — two toast renderers; we use sonner.toast() everywhere
 *                         but mount both so legacy <Toaster /> calls also work
 *   BrowserRouter       — HTML5 history-based routing (clean URLs, no #/)
 *
 * Routes:
 *   /         → Index (the tactical map)
 *   /auth     → Auth (login, signup, forgot password, resend confirmation)
 *   /account  → AccountCenter (profile, badge application, contact form)
 *   *         → NotFound (catch-all, MUST be last)
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import AccountCenter from "./pages/AccountCenter.tsx";
import NotFound from "./pages/NotFound.tsx";

// One QueryClient instance for the whole app — cache survives across pages.
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/account" element={<AccountCenter />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
