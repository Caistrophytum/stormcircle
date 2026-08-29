CREATE OR REPLACE FUNCTION public.run_maintenance()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  chat_retention     interval := '2 hours';
  system_retention   interval := '7 days';
  alert_grace        interval := '12 hours';
  zone_cache_ttl     interval := '7 days';
  cron_history_ttl   interval := '3 days';
  http_response_ttl  interval := '2 days';
  email_log_ttl      interval := '30 days';
  notification_ttl   interval := '30 days';
  push_sub_ttl       interval := '90 days';
BEGIN
  DELETE FROM public.messages
   WHERE badge <> 'System'
     AND created_at < now() - chat_retention;

  DELETE FROM public.messages
   WHERE badge = 'System'
     AND created_at < now() - system_retention;

  DELETE FROM public.active_alerts
   WHERE expires_at IS NOT NULL
     AND expires_at < now() - alert_grace;

  DELETE FROM public.zone_geom_cache
   WHERE fetched_at < now() - zone_cache_ttl;

  DELETE FROM public.email_send_log
   WHERE created_at < now() - email_log_ttl;
  DELETE FROM public.email_unsubscribe_tokens
   WHERE created_at < now() - email_log_ttl
     AND used_at IS NOT NULL;

  -- Notification inbox + dead device registrations.
  DELETE FROM public.notifications
   WHERE created_at < now() - notification_ttl;
  DELETE FROM public.push_subscriptions
   WHERE last_seen_at < now() - push_sub_ttl;

  BEGIN
    DELETE FROM cron.job_run_details
     WHERE (end_time IS NOT NULL AND end_time < now() - cron_history_ttl)
        OR (end_time IS NULL AND start_time < now() - cron_history_ttl);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_maintenance: cron history cleanup skipped: %', SQLERRM;
  END;

  BEGIN
    DELETE FROM net._http_response
     WHERE created < now() - http_response_ttl;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_maintenance: http response cleanup skipped: %', SQLERRM;
  END;
END;
$function$;

SELECT cron.unschedule('notify-dispatch') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-dispatch');

SELECT cron.schedule(
  'notify-dispatch',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://cmugqctuyqsimhfxruap.supabase.co/functions/v1/notify-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);