/**
 * NotFound.tsx — catch-all 404 route.
 *
 * Mounted by App.tsx as <Route path="*">, so any URL that doesn't match
 * a real route lands here. We log to the console (handy when debugging
 * broken links) and offer a one-click way back to the home page.
 */
import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    // Surface broken links in dev tools so we can spot bad <Link>s quickly.
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        {/* Plain <a> (not <Link>) — a hard nav guarantees we leave the
            broken state and reload the SPA from scratch. */}
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
