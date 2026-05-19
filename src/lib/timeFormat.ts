/**
 * Shared "X ago" formatter used by EventInfoPanel (desktop) and
 * MobileAlertsPanel. Output buckets: just now / Xs / X min / X hr / X d.
 */
export function formatRelativeTime(date: Date, now: Date): string {
  const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.floor(diffHr / 24)} d ago`;
}
