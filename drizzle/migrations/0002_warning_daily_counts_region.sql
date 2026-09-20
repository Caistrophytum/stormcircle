ALTER TABLE public.warning_daily_counts
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'US';

ALTER TABLE public.warning_daily_counts
  DROP CONSTRAINT IF EXISTS warning_daily_counts_pkey;

ALTER TABLE public.warning_daily_counts
  ADD PRIMARY KEY (event, day, region);

CREATE OR REPLACE FUNCTION public.rollup_warning_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  bucket date;
BEGIN
  bucket := ((now() AT TIME ZONE 'UTC') - interval '12 hours')::date;

  INSERT INTO public.warning_daily_counts (event, day, region, count, updated_at)
  SELECT event,
         bucket,
         CASE WHEN alert_id LIKE 'MA-%' THEN 'EU' ELSE 'US' END AS region,
         count(*)::int,
         now()
  FROM public.active_alerts
  WHERE first_seen_at >= now() - interval '1 hour'
    AND first_seen_at < now()
    AND event IS NOT NULL
    AND (
      lower(event) LIKE '%warning%'
      OR lower(event) LIKE '%watch%'
      OR lower(event) LIKE '%emergency%'
      OR lower(event) LIKE '%evacuation%'
      OR lower(event) LIKE '%shelter%'
    )
  GROUP BY event, 3
  ON CONFLICT (event, day, region)
  DO UPDATE SET count = warning_daily_counts.count + EXCLUDED.count,
                updated_at = EXCLUDED.updated_at;

  DELETE FROM public.warning_daily_counts
  WHERE day < bucket - interval '3 days';
END;
$$;