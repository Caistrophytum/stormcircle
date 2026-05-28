CREATE OR REPLACE FUNCTION public.upsert_cron_secret(_val text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = vault, public AS $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM vault.secrets WHERE name = 'cron_secret';
  IF sid IS NULL THEN
    PERFORM vault.create_secret(_val, 'cron_secret');
  ELSE
    PERFORM vault.update_secret(sid, _val, 'cron_secret');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_cron_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_cron_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_cron_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cron_secret(text) TO service_role;