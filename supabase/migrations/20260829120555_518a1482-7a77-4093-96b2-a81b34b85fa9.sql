-- ============================================================================
-- Consolidated maintenance routine.
-- Retention windows live in the DECLARE block below: edit them and re-run
-- CREATE OR REPLACE to change how long anything is kept.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  -- ---- editable retention windows -----------------------------------------
  chat_retention     interval := '2 hours';   -- user chat messages
  system_retention   interval := '7 days';    -- bot / System messages
  alert_grace        interval := '12 hours';  -- how long past expiry alerts stay
  zone_cache_ttl     interval := '7 days';    -- cached NWS zone geometry
  cron_history_ttl   interval := '3 days';    -- cron.job_run_details
  http_response_ttl  interval := '2 days';    -- net._http_response
  email_log_ttl      interval := '30 days';   -- email_send_log / unsubscribe tokens
BEGIN
  -- 1. Chat messages from real users.
  DELETE FROM public.messages
   WHERE badge <> 'System'
     AND created_at < now() - chat_retention;

  -- 2. Bot messages (previously kept forever).
  DELETE FROM public.messages
   WHERE badge = 'System'
     AND created_at < now() - system_retention;

  -- 3. Expired weather alerts, with a grace period so the UI can wind them down.
  DELETE FROM public.active_alerts
   WHERE expires_at IS NOT NULL
     AND expires_at < now() - alert_grace;

  -- 4. Cached zone geometry.
  DELETE FROM public.zone_geom_cache
   WHERE fetched_at < now() - zone_cache_ttl;

  -- 5. Email bookkeeping.
  DELETE FROM public.email_send_log
   WHERE created_at < now() - email_log_ttl;
  DELETE FROM public.email_unsubscribe_tokens
   WHERE created_at < now() - email_log_ttl
     AND used_at IS NOT NULL;

  -- 6. Scheduled-job history (main source of table bloat).
  BEGIN
    DELETE FROM cron.job_run_details
     WHERE (end_time IS NOT NULL AND end_time < now() - cron_history_ttl)
        OR (end_time IS NULL AND start_time < now() - cron_history_ttl);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_maintenance: cron history cleanup skipped: %', SQLERRM;
  END;

  -- 7. pg_net response log (nothing cleaned this before).
  BEGIN
    DELETE FROM net._http_response
     WHERE created < now() - http_response_ttl;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_maintenance: http response cleanup skipped: %', SQLERRM;
  END;
END;
$function$;

-- Only the scheduler and admin tooling may run it.
REVOKE ALL ON FUNCTION public.run_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_maintenance() TO service_role;

-- ---- Replace the overlapping jobs with one hourly job ----------------------
SELECT cron.unschedule('delete-old-messages');
SELECT cron.unschedule('cleanup-geom-and-alerts-weekly');
SELECT cron.unschedule('zone-geom-cache-cleanup-daily');
SELECT cron.unschedule('cleanup-cron-history-weekly');

SELECT cron.schedule(
  'maintenance-hourly',
  '23 * * * *',
  $cron$ SELECT public.run_maintenance(); $cron$
);

-- ---- Index hygiene ---------------------------------------------------------
-- Duplicates of existing UNIQUE constraints on the same column.
DROP INDEX IF EXISTS public.idx_unsubscribe_tokens_token;
DROP INDEX IF EXISTS public.idx_suppressed_emails_email;
-- Never used since creation.
DROP INDEX IF EXISTS public.active_alerts_first_seen_at_idx;
-- One unsubscribe token per address forever was unintended.
ALTER TABLE public.email_unsubscribe_tokens
  DROP CONSTRAINT IF EXISTS email_unsubscribe_tokens_email_key;