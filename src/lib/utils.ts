/**
 * cn — the standard shadcn helper for combining Tailwind class strings.
 *
 *   • clsx     handles conditional/array class arguments
 *   • twMerge  resolves Tailwind conflicts (e.g. `p-2` + `p-4` → `p-4`)
 *
 * Use it any time you build a className from multiple sources, e.g.
 *   className={cn("text-sm", isActive && "font-bold", props.className)}
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
