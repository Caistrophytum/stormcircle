ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now();
UPDATE public.profiles SET last_active_at = now() WHERE last_active_at IS NULL;
CREATE INDEX IF NOT EXISTS profiles_last_active_at_idx ON public.profiles (last_active_at);

CREATE OR REPLACE FUNCTION public.touch_last_active()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE prev timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT last_active_at INTO prev FROM public.profiles WHERE id = auth.uid();
  IF prev IS NULL OR prev < now() - interval '1 day' THEN
    UPDATE public.profiles SET last_active_at = now() WHERE id = auth.uid();
  END IF;
  RETURN prev;
END; $$;
REVOKE EXECUTE ON FUNCTION public.touch_last_active() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;

ALTER TABLE public.active_alerts
  ADD COLUMN IF NOT EXISTS bbox_min_lon double precision,
  ADD COLUMN IF NOT EXISTS bbox_max_lon double precision,
  ADD COLUMN IF NOT EXISTS bbox_min_lat double precision,
  ADD COLUMN IF NOT EXISTS bbox_max_lat double precision;

CREATE OR REPLACE FUNCTION public.set_alert_bbox()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.geometry IS NOT DISTINCT FROM OLD.geometry THEN
    RETURN NEW;
  END IF;
  IF NEW.geometry IS NULL THEN
    NEW.bbox_min_lon := NULL; NEW.bbox_max_lon := NULL; NEW.bbox_min_lat := NULL; NEW.bbox_max_lat := NULL;
    RETURN NEW;
  END IF;
  SELECT min((p->>0)::float8), max((p->>0)::float8), min((p->>1)::float8), max((p->>1)::float8)
    INTO NEW.bbox_min_lon, NEW.bbox_max_lon, NEW.bbox_min_lat, NEW.bbox_max_lat
  FROM jsonb_path_query(NEW.geometry, 'lax $.**') p
  WHERE jsonb_typeof(p) = 'array' AND jsonb_array_length(p) >= 2
    AND jsonb_typeof(p->0) = 'number' AND jsonb_typeof(p->1) = 'number';
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_set_alert_bbox ON public.active_alerts;
CREATE TRIGGER trg_set_alert_bbox BEFORE INSERT OR UPDATE ON public.active_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_alert_bbox();

CREATE INDEX IF NOT EXISTS active_alerts_bbox_idx ON public.active_alerts (bbox_min_lon, bbox_max_lon, bbox_min_lat, bbox_max_lat);

CREATE OR REPLACE FUNCTION public.run_maintenance()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  inactive_ttl       interval := '7 days';
BEGIN
  DELETE FROM public.messages WHERE badge <> 'System' AND created_at < now() - chat_retention;
  DELETE FROM public.messages WHERE badge = 'System' AND created_at < now() - system_retention;
  DELETE FROM public.active_alerts WHERE expires_at IS NOT NULL AND expires_at < now() - alert_grace;
  DELETE FROM public.zone_geom_cache WHERE fetched_at < now() - zone_cache_ttl;
  DELETE FROM public.email_send_log WHERE created_at < now() - email_log_ttl;
  DELETE FROM public.email_unsubscribe_tokens WHERE created_at < now() - email_log_ttl AND used_at IS NOT NULL;
  DELETE FROM public.notifications WHERE created_at < now() - notification_ttl;
  DELETE FROM public.push_subscriptions WHERE last_seen_at < now() - push_sub_ttl;
  DELETE FROM public.push_subscriptions ps USING public.profiles pr
   WHERE pr.id = ps.user_id AND pr.last_active_at < now() - inactive_ttl;
  BEGIN
    DELETE FROM cron.job_run_details
     WHERE (end_time IS NOT NULL AND end_time < now() - cron_history_ttl)
        OR (end_time IS NULL AND start_time < now() - cron_history_ttl);
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'run_maintenance: cron history cleanup skipped: %', SQLERRM;
  END;
  BEGIN
    DELETE FROM net._http_response WHERE created < now() - http_response_ttl;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'run_maintenance: http response cleanup skipped: %', SQLERRM;
  END;
END;
$function$;