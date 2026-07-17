/**
 * miniWindowStore — global singleton enforcing that only one "mini" floating
 * window (Live Radar, Live Reports, Bot messages, …) is open at a time.
 *
 * The expanded/full-view radar window is NOT a mini window and bypasses this
 * store entirely.
 */
import { useEffect, useState } from "react";

type Listener = (id: string | null) => void;

let current: string | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(current);
}

export function openMiniWindow(id: string) {
  if (current === id) return;
  current = id;
  emit();
}

export function closeMiniWindow(id: string) {
  if (current !== id) return;
  current = null;
  emit();
}

/** Subscribe a component to a specific mini-window id. */
export function useMiniWindow(id: string) {
  const [isOpen, setIsOpen] = useState(current === id);
  useEffect(() => {
    const l: Listener = (c) => setIsOpen(c === id);
    listeners.add(l);
    // Sync in case current changed between render + effect.
    setIsOpen(current === id);
    return () => {
      listeners.delete(l);
    };
  }, [id]);
  return {
    isOpen,
    open: () => openMiniWindow(id),
    close: () => closeMiniWindow(id),
  };
}
