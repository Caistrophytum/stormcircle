/**
 * main.tsx - application entry point.
 *
 * Mounts <App /> inside a single <DataProvider> so every component that needs
 * alerts, polygons, the current user, LSRs, or the online count shares ONE
 * subscription instead of opening its own. See DataProvider.tsx for why.
 */
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { DataProvider } from "./providers/DataProvider";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./index.css";

// Log stray async failures instead of letting them surface as uncaught noise.
window.addEventListener("unhandledrejection", (e) => {
  console.warn("[unhandledrejection]", e.reason);
  e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <HelmetProvider>
      <DataProvider>
        <App />
      </DataProvider>
    </HelmetProvider>
  </AppErrorBoundary>
);
