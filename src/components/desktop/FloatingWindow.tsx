/**
 * FloatingWindow — reusable modal panel styled to match the existing
 * ExerciseComfort overlay (dark, neon amber border, backdrop-blur backdrop).
 */
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";

function useDockRect() {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const el = document.getElementById("desktop-dock");
    if (!el) return;
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, []);
  return rect;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: string;
  height?: string;
  accent?: string;
  /** "center" = modal with backdrop; "left-of-dock" = anchored beside the dock (no backdrop). */
  anchor?: "center" | "left-of-dock";
}

export default function FloatingWindow({
  open,
  onClose,
  title,
  subtitle,
  children,
  width,
  height,
  accent = "255,157,0",
  anchor = "left-of-dock",
}: Props) {
  const isModal = anchor === "center";
  const dockRect = useDockRect();

  // Anchored geometry: body-level overlay, same width/height as the tabs window,
  // with its right edge 12px to the left of the tabs window's left edge.
  const anchoredStyle: React.CSSProperties = dockRect
    ? {
        position: "fixed",
        top: dockRect.top,
        height: dockRect.height,
        left: dockRect.left - dockRect.width - 12,
        width: dockRect.width,
      }
    : {
        position: "fixed",
        bottom: 16,
        left: 16,
        height: "min(80dvh, 720px)",
        width: "calc((100vw - 56px) / 3)",
      };

  const panel = (
    <motion.div
      onClick={(e) => e.stopPropagation()}
      initial={{ scale: isModal ? 0.97 : 1, opacity: 0, x: isModal ? 0 : 20 }}
      animate={{ scale: 1, opacity: 1, x: 0 }}
      exit={{ scale: isModal ? 0.97 : 1, opacity: 0, x: isModal ? 0 : 20 }}
      transition={{ type: "spring", damping: 22, stiffness: 260 }}
      className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl font-mono"
      style={{
        ...(isModal
          ? { width: width ?? "33vw", height: height ?? "min(80dvh, 720px)" }
          : anchoredStyle),
        background: "rgba(10,10,14,0.92)",
        backdropFilter: "blur(20px)",
        border: `1px solid rgba(${accent},0.4)`,
        boxShadow: `0 0 40px rgba(${accent},0.25), 0 20px 60px rgba(0,0,0,0.6)`,
        color: "#e8e8e8",
        zIndex: 1200,
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid rgba(${accent},0.25)` }}
      >
        <div className="min-w-0">
          <div
            className="truncate text-xs font-bold uppercase tracking-widest"
            style={{ color: `rgb(${accent})` }}
          >
            {title}
          </div>
          {subtitle && (
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{subtitle}</div>
          )}
        </div>
        <button
          aria-label="Close"
          onClick={onClose}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
          style={{
            border: `1px solid rgba(${accent},0.35)`,
            color: `rgb(${accent})`,
          }}
        >
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </motion.div>
  );

  const tree = (
    <AnimatePresence>
      {open &&
        (isModal ? (
          <motion.div
            role="dialog"
            aria-label={title}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1200] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
          >
            {panel}
          </motion.div>
        ) : (
          panel
        ))}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(tree, document.body);
}
