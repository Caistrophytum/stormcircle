import { useEffect, useState } from "react";

export default function MobileGuard({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    function check() {
      const width = window.innerWidth;
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      // Block: portrait mode on any device under 1024px
      // Allow: landscape tablets/phones (1024px+ width) and all desktops
      setBlocked(width < 1024 && portrait);
    }
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  if (blocked) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#0a0a14",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "2rem",
          textAlign: "center",
          fontFamily: "monospace",
        }}
      >
        <span style={{ fontSize: "3rem" }}>⛈</span>
        <h1 style={{ color: "#7dd3fc", fontSize: "1.2rem", margin: "1rem 0 0.5rem" }}>
          StormCircle
        </h1>
        <p style={{ color: "#aaa", fontSize: "0.85rem", maxWidth: "280px", lineHeight: 1.6 }}>
          StormCircle is optimized for desktop and landscape use. Please rotate your device or
          switch to a larger screen for the best experience.
        </p>
        <p style={{ color: "#999", fontSize: "0.7rem", marginTop: "2rem" }}>
          Rotate to landscape to continue on this device.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
