# Database optimizations + 7-day inactivity rule

## My take on the 7-day idea
Good instinct, with one adjustment. Logging someone out in the browser does not stop push messages by itself: their device stays registered on our side until we remove it. So the rule should run on the server:

- Each visit records "last active" (at most once per day, so it costs almost nothing).
- If a user has not been active for 7+ days, the notification job skips them and removes their device registrations. This is what actually ends ghost notifications.
- When they come back after 7+ days, they are signed out and asked to sign in again. Their notification settings are kept, and the device re-registers after sign-in.

Note: someone who relies only on alerts (never opens the site) would stop getting warnings after a week. The sign-out shows a short message explaining why.

## Optimizations (from the spreadsheet, in order of impact)
1. **Zone shape storage**: stop rewriting map shapes that have not changed. This is the biggest write load (about 880 MB of log churn in 2 hours).
2. **Notification alert matching**: pre-filter alerts by rough area before downloading full shapes, then keep the exact check.
3. **Notification bookkeeping**: skip saving per-user state when nothing changed.
4. **European warnings**: only save warnings whose content changed.
5. **Alert summaries on the site**: skip expired alerts and unused fields.
6. **Chat checks**: read only messages newer than each person's last check; filter bot messages before download on mobile.

Every change keeps current behavior (no missed warnings, no duplicate alerts). Afterwards I measure again and add a "v2" spreadsheet with real before/after numbers.

## Technical details
- Migration: `profiles.last_active_at timestamptz`, index; `touch_last_active()` security-definer RPC throttled to 24h; extend `run_maintenance` to delete `push_subscriptions` of users inactive >7d.
- notify-dispatch: exclude users with `last_active_at < now() - 7d` (null treated as active until first touch, then backfilled to now()).
- Client (`DataProvider`): on session load, read `last_active_at`; if >7d, `signOut()` with toast; else call the RPC.
- alerts-poll: hash geometry, upsert only changed rows, freshness via separate light update.
- notify-dispatch: bbox columns on `active_alerts` (min/max lat/lon computed at write) + index; select geometry only for candidates; diff state before upsert; per-user chat cursor.
- meteoalarm-poll: reuse `content_hash` to skip unchanged rows.
- DataProvider `loadSummary`: `expires_at > now()` filter, narrower select.
- Verify via edge logs, a full notify-dispatch run, and pg_stat_statements re-measurement.
