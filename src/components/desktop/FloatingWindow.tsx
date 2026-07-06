/**
 * FloatingWindow — reusable modal panel styled to match the existing
 * ExerciseComfort overlay (dark, neon amber border, backdrop-blur backdrop).
 */
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: string;
  height?: string;
  accent?: string;
}

export default function FloatingWindow({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "min(720px, 92vw)",
  height = "min(80dvh, 720px)",
  accent = "255,157,0",
}: Props) {
  return (
    <AnimatePresence>
      {open && (
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
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            className="flex flex-col overflow-hidden rounded-2xl font-mono"
            style={{
              width,
              height,
              background: "rgba(10,10,14,0.92)",
              backdropFilter: "blur(20px)",
              border: `1px solid rgba(${accent},0.4)`,
              boxShadow: `0 0 40px rgba(${accent},0.25), 0 20px 60px rgba(0,0,0,0.6)`,
              color: "#e8e8e8",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: `1px solid rgba(${accent},0.25)` }}
            >
              <div>
                <div
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: `rgb(${accent})` }}
                >
                  {title}
                </div>
                {subtitle && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</div>
                )}
              </div>
              <button
                aria-label="Close"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                style={{
                  border: `1px solid rgba(${accent},0.35)`,
                  color: `rgb(${accent})`,
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
