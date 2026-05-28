CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA internal TO service_role;

DROP FUNCTION IF EXISTS public.vault_create_cron_secret(text);
DROP FUNCTION IF EXISTS public.vault_update_cron_secret(text);

CREATE OR REPLACE FUNCTION internal.upsert_cron_secret(_val text)
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

REVOKE ALL ON FUNCTION internal.upsert_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.upsert_cron_secret(text) TO service_role;