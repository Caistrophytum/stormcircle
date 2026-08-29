# Database Deep Scan: Findings and Clean-Up Plan

Read-only audit of the live database (tables, indexes, policies, scheduled jobs, storage/bloat, security linter). Below is what is actually there today, what is wrong or inconsistent, and the exact SQL to change it so you can adjust anything yourself.

## Health snapshot (measured now)

- Database size 142.6 MB, disk 17% used, memory 71% used, connections 17/60.
- WAL (the write-ahead log, Postgres' crash-recovery journal) is 1024 MB, which is large relative to a 142 MB database.
- Rolled-back transactions since boot: 66,861. Some rollbacks are normal (the email helpers use exception blocks), but this count is high enough to be worth confirming.
- All 13 public tables have row-level security enabled, a primary key, and at least one policy. No missing-RLS problems.

## Findings, in priority order

### 1. Table bloat: 112 MB of the 142 MB database is dead space

| Table | Live rows | Disk | Comment |
|---|---|---|---|
| `cron.job_run_details` | 4,865 | 43 MB | Should be ~2 MB. Bloated from repeated mass deletes. |
| `net._http_response` | 399 | 27 MB | pg_net response log, never cleaned. |
| `public.zone_geom_cache` | 3,428 | 42 MB | Mostly TOAST (large JSON geometry); partly legitimate, partly bloat. |
| `public.active_alerts` | 247 | 15 MB | Large JSON geometry plus 136 dead rows. |

Autovacuum reclaims space *inside* a table but never returns it to disk. Only `VACUUM FULL` shrinks the file, and it briefly locks the table.

### 2. Cleanup jobs overlap and contradict each other

Current schedule:

- `delete-old-messages` (every 6 h) deletes non-System chat messages older than 2 hours.
- `cleanup-geom-and-alerts-weekly` (Sunday 00:00) deletes zone cache older than 7 days and expired alerts.
- `zone-geom-cache-cleanup-daily` (03:17 daily) deletes zone cache older than 7 days - duplicate of part of the weekly job.
- `cleanup-cron-history-weekly` (Sunday 00:05) trims cron history older than 3 days.

Problems:
- The 2-hour chat retention only runs every 6 hours, so a message actually survives 2 to 8 hours. The intent and the schedule do not match.
- Zone cache cleanup exists twice; the weekly copy is redundant.
- Cron history is trimmed to 3 days but only weekly, so it grows to a week's worth (currently 15,265 rows) before being cut, which is what causes the bloat in finding 1.
- Expired alerts are only removed weekly: 88 of the 247 alert rows are already expired right now.
- Nothing at all cleans `net._http_response`, `email_send_log`, or `email_unsubscribe_tokens`.

### 3. Bot messages accumulate forever

All 185 rows in `messages` carry badge `System`, dating back to 15 Aug. The retention job deliberately skips System rows, so bot posts never expire. Also, 183 of them are posted by a single bot identity (`...0001`), while `...0000` and `...0002` have one message each, so the bot identities are not being used consistently.

### 4. Unused and duplicate indexes

- `email_unsubscribe_tokens` has both `email_unsubscribe_tokens_token_key` (unique) and `idx_unsubscribe_tokens_token` on the same column - one is redundant.
- `suppressed_emails` has both `suppressed_emails_email_key` (unique) and `idx_suppressed_emails_email` - same duplication.
- `email_unsubscribe_tokens_email_key` is unique on `email`, which permanently limits each address to one unsubscribe token ever. That is probably not intended.
- `active_alerts_first_seen_at_idx` has never been used (0 scans).

### 5. Security linter: 2 warnings, both expected

`delete_user()` and `is_meteorologist(uuid)` are SECURITY DEFINER functions executable by signed-in users. That is by design (account deletion and moderator checks), and both check `auth.uid()` internally. No change needed; they can be marked as accepted.

## What I would change

1. Reclaim disk: `VACUUM FULL` on `cron.job_run_details`, `net._http_response`, `active_alerts`, `zone_geom_cache`.
2. Consolidate cleanup into one hourly maintenance job covering cron history (3 days), pg_net responses (2 days), expired alerts (12 h past expiry), zone cache (7 days), old chat messages, and email logs (30 days); remove the three overlapping jobs.
3. Add a System-message retention window (default 7 days, easily editable) so bot posts stop accumulating.
4. Drop the two duplicate indexes and the unused one, and drop the unique constraint on unsubscribe token email.
5. Record the two SECURITY DEFINER linter warnings as accepted in the security memory.
6. Write `docs/database-maintenance.md` with a table-by-table explanation, the full job list with editable retention values, and copy-paste SQL for each change, so you can tune retention yourself later.

## Technical notes

Each cleanup change ships as a migration you can read and adjust. Retention values are plain intervals at the top of the maintenance function, for example:

```sql
-- edit these to taste
chat_retention      interval := '2 hours';
system_retention    interval := '7 days';
alert_grace         interval := '12 hours';
zone_cache_ttl      interval := '7 days';
cron_history_ttl    interval := '3 days';
http_response_ttl   interval := '2 days';
email_log_ttl       interval := '30 days';
```

`VACUUM FULL` cannot run inside a migration transaction; it will be run separately via direct SQL during a quiet moment. No table structure, RLS policy, or grant is removed by this plan - only indexes named above, redundant cron jobs, and dead rows.
