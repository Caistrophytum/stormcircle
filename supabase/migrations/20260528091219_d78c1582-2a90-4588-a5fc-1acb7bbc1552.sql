CREATE OR REPLACE FUNCTION public.vault_create_cron_secret(_val text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = vault, public AS $$
DECLARE new_id uuid;
BEGIN
  SELECT vault.create_secret(_val, 'cron_secret') INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_update_cron_secret(_val text)
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

REVOKE ALL ON FUNCTION public.vault_create_cron_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vault_update_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_create_cron_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_update_cron_secret(text) TO service_role;