/**
 * main.tsx — application entry point.
 *
 * Vite calls this file first when the app boots. Its only job is to:
 *   1. Find the <div id="root"> element in index.html
 *   2. Mount our top-level <App /> component into it
 *   3. Pull in the global stylesheet (index.css, which defines the
 *      Tailwind layers and our design tokens)
 *
 * No application logic lives here on purpose — keep it minimal.
 */
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

// The "!" tells TypeScript "trust me, #root exists" — index.html guarantees it.
createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
