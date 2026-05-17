/**
 * useHurricaneBot — DEPRECATED.
 *
 * All Hurricane Bot posting (advisory updates, danger detail cards, season
 * status with ENSO line) now happens server-side in the `nhc-poll` and
 * `enso-poll` edge functions, fired by pg_cron. This hook is a no-op kept
 * only so any older imports don't break at compile time.
 */
export function useHurricaneBot(): void {
  // intentional no-op — server-side polling handles all bot messages
}
