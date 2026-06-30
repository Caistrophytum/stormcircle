SELECT net.http_post(
  url:='https://cmugqctuyqsimhfxruap.supabase.co/functions/v1/enso-poll',
  headers:=jsonb_build_object('x-cron-secret', current_setting('app.cron_secret', true), 'Content-Type','application/json'),
  body:='{}'::jsonb
);