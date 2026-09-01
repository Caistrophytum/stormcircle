CREATE OR REPLACE FUNCTION public.rate_limit_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  recent_count int;
BEGIN
  -- Bots / system posts bypass the limit (they are service-role writes).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO recent_count
  FROM public.messages
  WHERE user_id = NEW.user_id
    AND created_at > now() - interval '1 minute';

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: please wait before posting again';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rate_limit_messages ON public.messages;
CREATE TRIGGER trg_rate_limit_messages
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.rate_limit_messages();