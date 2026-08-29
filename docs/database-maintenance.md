# Database maintenance guide

Everything about how StormCircle's database keeps itself tidy, written so you can change
any of it yourself. Last audited and cleaned: 29 Aug 2026.

---

## 1. Result of the clean-up

| Table | Before | After |
| --- | --- | --- |
| `cron.job_run_details` (scheduled-job history) | 43 MB | 2.2 MB |
| `net._http_response` (internal HTTP call log) | 27 MB | 184 kB |
| `public.zone_geom_cache` (cached map shapes) | 42 MB | 21 MB |
| `public.active_alerts` | 15 MB | 5.9 MB |
| **Total database** | **142.6 MB** | **~31 MB** |

Nothing user-facing was deleted: only expired alerts, cached geometry, log rows,
and bot messages older than the retention windows below.

Why the sizes were so far off: Postgres' automatic vacuum reuses free space *inside*
a table but never gives it back to the operating system. Only `VACUUM FULL` rewrites
the table and shrinks the file, and it briefly locks the table, so it is a manual
operation, not something to schedule.

---

## 2. The one maintenance job

There is now a single database function, `public.run_maintenance()`, scheduled hourly
at minute 23 under the job name `maintenance-hourly`.

It replaced four overlapping jobs that were removed:

- `delete-old-messages` (every 6 h) - claimed 2-hour chat retention but only ran
  every 6 hours, so messages actually lived 2 to 8 hours.
- `cleanup-geom-and-alerts-weekly` (Sundays) - duplicated the daily zone-cache job.
- `zone-geom-cache-cleanup-daily` - the duplicate half.
- `cleanup-cron-history-weekly` - trimmed to 3 days but only weekly, so a week of
  history accumulated first. That was the main cause of the 43 MB bloat.

### What it deletes

1. Chat messages from real users older than `chat_retention`.
2. Bot / `System` messages older than `system_retention`. Previously these were
   excluded from every clean-up and had accumulated since 15 Aug.
3. Weather alerts more than `alert_grace` past their expiry.
4. Cached NWS zone geometry older than `zone_cache_ttl`.
5. Email send-log rows and used unsubscribe tokens older than `email_log_ttl`.
6. Scheduled-job history older than `cron_history_ttl`.
7. `pg_net` HTTP response rows older than `http_response_ttl` (nothing cleaned these before).

Steps 6 and 7 are wrapped in error handlers, so if an extension changes shape the
rest of the maintenance still runs.

### Changing a retention window

The values are plain intervals at the top of the function:

```sql
chat_retention     interval := '2 hours';
system_retention   interval := '7 days';
alert_grace        interval := '12 hours';
zone_cache_ttl     interval := '7 days';
cron_history_ttl   interval := '3 days';
http_response_ttl  interval := '2 days';
email_log_ttl      interval := '30 days';
```

To change one, edit the value and re-run the whole `CREATE OR REPLACE FUNCTION
public.run_maintenance() ...` block (it lives in the migration dated 29 Aug 2026 under
`supabase/migrations/`). To change how often it runs:

```sql
SELECT cron.unschedule('maintenance-hourly');
SELECT cron.schedule('maintenance-hourly', '23 */6 * * *',
                     $$ SELECT public.run_maintenance(); $$);
```

To run it immediately: `SELECT public.run_maintenance();`

---

## 3. Full list of scheduled jobs

| Job | Schedule | Purpose |
| --- | --- | --- |
| `alerts-poll-1min` | every minute | NWS alerts ingest |
| `ims-poll-15min` | every 15 min | Israeli IMS warnings |
| `spc-poll-hourly` | hourly | SPC convective outlook |
| `fire-poll-hourly` | hourly | SPC fire weather outlook |
| `nhc-poll-4h` | every 4 h | Hurricane centre storms |
| `enso-poll-6h` | every 6 h | ENSO / Nino 3.4 anomaly |
| `maintenance-hourly` | minute 23 hourly | all data retention (above) |
| `zone-geom-cache-vacuum-3d` | every 3 days 03:47 | routine `VACUUM (ANALYZE)` on the geometry cache |
| `process-email-queue` | created on demand | drains the email queue, unschedules itself when empty |

Inspect them any time with:

```sql
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
SELECT jobid, status, count(*) FROM cron.job_run_details
 WHERE start_time > now() - interval '1 day' GROUP BY 1,2;
```

---

## 4. Index changes

Removed:

- `idx_unsubscribe_tokens_token` - duplicate of the `token` unique constraint.
- `idx_suppressed_emails_email` - duplicate of the `email` unique constraint.
- `active_alerts_first_seen_at_idx` - zero scans since creation.
- constraint `email_unsubscribe_tokens_email_key` - it made `email` unique, which
  meant an address could only ever receive one unsubscribe token. Tokens are still
  unique by `token`.

Find unused indexes yourself later with:

```sql
SELECT relname, indexrelname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid))
  FROM pg_stat_user_indexes
 WHERE schemaname = 'public'
 ORDER BY idx_scan;
```

---

## 5. Table-by-table reference

| Table | Contents | Retention |
| --- | --- | --- |
| `profiles` | one row per account (username, email, badge, hometown) | permanent |
| `messages` | chat + bot posts | 2 h users / 7 d bots |
| `report_approvals` | meteorologist verification of a report topic | auto-removed when the last matching message goes |
| `active_alerts` | NWS + IMS alerts with polygons | 12 h past expiry |
| `zone_geom_cache` | cached NWS zone polygons | 7 days |
| `spc_outlook_state`, `fire_outlook_state`, `enso_state` | single-row bot state | overwritten in place |
| `nhc_storms` | active tropical systems | overwritten by the poller |
| `email_send_log`, `email_send_state`, `email_unsubscribe_tokens`, `suppressed_emails` | email plumbing | 30 days for logs/used tokens |

Integrity checks run during the audit, all clean: every public table has row-level
security enabled, a primary key and at least one policy; no chat message points at a
missing profile; no alert rows are missing geometry.

---

## 6. Known-and-accepted security linter warnings

Two `SECURITY DEFINER` functions are intentionally callable by signed-in users:

- `public.delete_user()` - account self-deletion; it rejects the call when
  `auth.uid()` is null and only ever deletes the caller's own row.
- `public.is_meteorologist(uuid)` - moderator check used inside RLS policies; it
  returns a boolean and leaks nothing.

`public.run_maintenance()` is *not* in that category: `EXECUTE` is revoked from
`anon` and `authenticated` and granted only to the service role and the scheduler.

---

## 7. Things to watch

- **WAL size (1 GB).** The write-ahead log is large relative to the database.
  It is bounded by server settings and is not a leak, but if disk usage climbs it is
  the first thing to check.
- **Rolled-back transactions (66,861 since boot).** Mostly expected: the email queue
  helpers use exception blocks, and `alerts-poll` runs every minute with
  `ON CONFLICT` upserts. Worth a second look only if the number grows quickly
  between checks.
- **Bot identities.** Bot posts use three fixed user ids ending `...0000`, `...0001`
  and `...0002`, but 183 of 185 posts came from `...0001`. Harmless today; if you ever
  want per-bot attribution in the UI, that is where to start.
