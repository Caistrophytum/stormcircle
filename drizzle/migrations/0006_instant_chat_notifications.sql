CREATE OR REPLACE FUNCTION public.kick_chat_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.badge = 'System' THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://cmugqctuyqsimhfxruap.supabase.co/functions/v1/notify-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdWdxY3R1eXFzaW1oZnhydWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjIwNjEsImV4cCI6MjA5MjU5ODA2MX0.higMX3-3G9q_RqDEVqUNI7pQNoHTybFLRCVaIIgtxHE'
      ),
      body := '{"mode":"chat"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'kick_chat_notify skipped: %', SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.kick_chat_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kick_chat_notify ON public.messages;
CREATE TRIGGER trg_kick_chat_notify
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.kick_chat_notify();