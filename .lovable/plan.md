# Next-day weather recap notification

## What the user sees
A new "Tomorrow's weather recap" section on the notifications settings screen:
- On/off toggle for the daily recap.
- Delivery-hour slider from 4 AM to 11 AM (in the user's own timezone).
- Toggle "Include best times to exercise". When it's on, pick one or more activities (walk, run, bike, hike, calisthenics).

Each day at the chosen hour, one notification goes out for the user's hometown, for example:
"Tomorrow in Tel Aviv: a mild morning turning into a hot afternoon, moderate breeze, very high UV, medium chance of light rain.
Best times: Run 06:00-08:00 (score 86), Calisthenics 18:00-20:00 (score 79)."

Units follow the user's US/SI setting when that is known, and SI otherwise. The recap shows up in the notification bell and as a push notification, just like the other categories. Quiet hours still apply.

## How it works
- Once an hour, the existing notification job checks which users have reached their chosen local hour and have not received today's recap yet.
- For each of those users it pulls one Open-Meteo hourly forecast for the next day: apparent temperature, wind, UV and precipitation.
- The best exercise windows come from the existing Exercise Comfort scoring. For each chosen activity, it picks the highest-scoring 2-hour window between 05:00 and 21:00.
- A per-day dedupe key means each user gets at most one recap a day.

## Technical details
- Migration: add these columns to `notification_prefs`:
  - `daily_recap boolean default false`
  - `recap_hour smallint default 7`, with a check that it is between 4 and 11
  - `recap_exercise boolean default false`
  - `recap_activities text[] default '{}'`
  - `recap_units text default 'si'`
- Add `last_recap_date date` to `notification_state`.
- `NotificationSettings.tsx`: add the new fields to the prefs type and defaults, plus a section with the toggle, the hour slider (4-11), the exercise toggle and multi-select activity chips. The units setting is saved from `useUnitSystem` whenever the user saves.
- `supabase/functions/notify-dispatch`: add a recap step with category `daily_recap`. It reuses the subscriber geocode that is already done and fetches the forecast once per unique location. The exercise scoring from `src/lib/exerciseComfort.ts` is copied into `supabase/functions/notify-dispatch/comfort.ts`, because edge functions can't import from `src/`. The recap is skipped when the user has no location.
- Check the current notify-dispatch schedule first. If it runs less often than hourly, add an hourly trigger path for the recap only.
- Regenerate types, then run a type-check and a manual function test.
