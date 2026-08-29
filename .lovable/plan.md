# Alert and WRS Notifications

Add notifications that reach users both in the app and through the browser (even when the tab is closed), driven by their profile hometown.

## What triggers a notification

1. New weather alert covering the hometown (NWS or IMS), including the event type in the text.
2. Severity upgrade on an alert already covering the hometown (for example Watch to Warning, or Severe to Extreme).
3. WRS rising rapidly or falling rapidly for the hometown (default: a change of 15 points or more within 30 minutes; threshold adjustable per user).
4. SPC Day 1 categorical risk at the hometown reaching ENH (level 3) or above, and any change upward.
5. Fire weather outlook covering the hometown at any level (Elevated and above).

All triggers are evaluated server-side so they fire whether or not the site is open.

## Delivery

- **Browser push**: a service worker plus Web Push. Users grant permission from the app; each device stores a push subscription.
- **In-app**: a bell in the desktop status bar and the mobile header, showing unread count, a dropdown list of recent notifications, and a toast when one arrives while the app is open (live via realtime).

Duplicate suppression: each notification carries a dedupe key (for example `alert:<alert_id>:<severity>`), so the same event is never sent twice, and there is a per-user rate cap (max 1 WRS notification per hour, max 10 notifications per hour overall).

## Settings

- **Account Center**: full section with a master toggle, per-trigger toggles (alerts, severity upgrades, WRS swings, SPC, fire), a WRS sensitivity slider, a quiet-hours window in the hometown's local time, and a list of registered devices with the option to remove one.
- **Bell popover**: enable/disable push on this device, mute for 24 hours, mark all read, and a link to the full settings.

Notifications require a saved hometown; if none is set, the settings section prompts the user to set one.

## Technical notes

Database (new tables, RLS scoped to the owner, plus grants):

- `notification_prefs` - one row per user: master switch, per-trigger flags, WRS delta threshold, quiet hours, timezone.
- `push_subscriptions` - endpoint, p256dh/auth keys, user agent, last-seen, per device.
- `notifications` - the in-app inbox: title, body, category, severity, payload JSON, dedupe key (unique per user), read flag. Added to the realtime publication so the bell updates live.
- `notification_state` - per-user last-evaluated snapshot: last WRS value and timestamp, last SPC level, last fire level, and the set of active alert ids/severities used for upgrade detection.

Edge functions:

- `notify-dispatch` - cron every 5 minutes, guarded by `CRON_SECRET`. For each user with notifications enabled: resolve hometown coordinates (cached), point-in-polygon against `active_alerts` for NWS and IMS, read `spc_outlook_state` and `fire_outlook_state`, compute WRS from Open-Meteo using a Deno port of the scoring in `src/lib/wrs.ts`, diff against `notification_state`, insert `notifications` rows, and send Web Push to each subscription. Coordinates and Open-Meteo results are cached by rounded lat/lon so many users in one city cost one fetch.
- `push-subscribe` - validates the JWT and upserts/removes a device subscription.

Push keys: a VAPID keypair is generated and stored as backend secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); the public key is exposed through a small function so the client can subscribe. Web Push is signed with a Deno-compatible library, and 404/410 responses prune dead subscriptions.

Frontend:

- `public/sw.js` service worker handling `push` and `notificationclick` (focus or open the app).
- `src/hooks/useNotifications.ts` - inbox query, realtime subscription, unread count, mark-read, toast on insert.
- `src/hooks/usePushRegistration.ts` - permission request, subscribe/unsubscribe, key sync.
- `src/components/NotificationBell.tsx` used in `StatusBar.tsx` and `MobileHeader.tsx`.
- New notifications section in `src/pages/AccountCenter.tsx`.

Cost control: one cron every 5 minutes, per-city caching, and `run_maintenance()` extended to delete read notifications older than 14 days and unread ones older than 30 days.
