# Faster important notifications without extra compute

## Key finding
A plain 15-second timer would run the notification job 5,760 times a day (20x today), mostly finding nothing. And it would not actually make warnings faster: new warnings only enter the app once a minute (US and EU warning checks), and WRS data refreshes every minute too. So the job would re-check the same data 4 times.

## Approach: "fire when something happens" instead of a 15s timer
- **Chat**: when a report is posted, the notification job is started right away for that message. Delivery in a few seconds, not 15. Zero cost when nobody posts.
- **Warnings in your area**: the US and EU warning checkers start the notification job immediately whenever they save a new or upgraded warning. Delivery within seconds of the warning reaching the app. No cost on quiet minutes.
- **WRS**: checked on the existing 1-minute warning cycle only when that cycle runs anyway, with a 15-second fallback is not needed. Effective delay about 1 minute (the data itself only changes that often).
- **Safety net**: the regular 5-minute sweep stays as a backstop for recaps and anything missed.
- Duplicate protection: if two triggers land together, the second one exits immediately.

## Compromises to offset cost
- EU warning check (MeteoAlarm): every 1 min to every 3 min. EU agencies update rarely; saves about 960 runs a day.
- Severe/fire outlook checks stay hourly; hurricane stays 4-hourly.
- Light "quick mode" for triggered runs: only the affected users/area are checked, not everyone.

## Net effect
Chat and warnings become near-instant, WRS about 1 minute, and total background runs drop slightly compared to today.

## Technical details
- Database trigger on `messages` insert calls notify-dispatch via pg_net with `{mode:"chat", message_id}`.
- alerts-poll / meteoalarm-poll invoke notify-dispatch with `{mode:"alerts", ids:[...]}` when rows are inserted/upgraded.
- Advisory lock / run marker in notify-dispatch to skip overlapping runs; scoped modes skip recap and unrelated categories.
- Reschedule meteoalarm-poll-1min to `*/3 * * * *`.
