SELECT net.http_post(
  url := 'https://cmugqctuyqsimhfxruap.supabase.co/functions/v1/enso-poll',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret')
  ),
  body := '{}'::jsonb
);