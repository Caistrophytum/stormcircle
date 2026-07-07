/**
 * FloatingChat — bottom-right square glassy chat panel.
 * Wraps CitizenReports and flashes a white border when a new message arrives.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import CitizenReports from "@/components/CitizenReports";
import { useNewReportPing } from "@/hooks/useNewReportPing";

export default function FloatingChat() {
  const ping = useNewReportPing();
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (ping === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [ping]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.15, type: "spring", damping: 24 }}
      className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl"
      style={{
        width: "calc((100vw - 56px) / 3)",
        height: "40dvh",
        minHeight: 320,
        background: "rgba(18,18,22,0.72)",
        backdropFilter: "blur(24px)",
        border: flash
          ? "1px solid rgba(255,255,255,0.95)"
          : "1px solid rgba(255,255,255,0.12)",
        boxShadow: flash
          ? "0 0 32px rgba(255,255,255,0.5), 0 20px 40px rgba(0,0,0,0.5)"
          : "0 0 20px rgba(0,0,0,0.5), 0 12px 32px rgba(0,0,0,0.5)",
        transition: "border-color 200ms ease, box-shadow 200ms ease",
      }}
    >
      {/* CitizenReports renders an <aside class="w-80 h-full …"> — override
          with a wrapping div that forces full-width fill of our square. */}
      <div className="h-full w-full [&>aside]:!w-full [&>aside]:!border-0 [&>aside]:!bg-transparent">
        <CitizenReports />
      </div>
    </motion.div>
  );
}
