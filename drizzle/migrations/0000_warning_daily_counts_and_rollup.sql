CREATE TABLE public.warning_daily_counts (
  event text NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (event, day)
);

GRANT SELECT ON public.warning_daily_counts TO anon;
GRANT SELECT ON public.warning_daily_counts TO authenticated;
GRANT ALL ON public.warning_daily_counts TO service_role;

ALTER TABLE public.warning_daily_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read warning daily counts"
ON public.warning_daily_counts
FOR SELECT
TO public
USING (true);

CREATE POLICY "Service role can manage warning daily counts"
ON public.warning_daily_counts
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

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

  INSERT INTO public.warning_daily_counts (event, day, count, updated_at)
  SELECT event, bucket, count(*)::int, now()
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
  GROUP BY event
  ON CONFLICT (event, day)
  DO UPDATE SET count = warning_daily_counts.count + EXCLUDED.count,
                updated_at = EXCLUDED.updated_at;

  DELETE FROM public.warning_daily_counts
  WHERE day < bucket - interval '3 days';
END;
$$;

SELECT cron.schedule(
  'rollup-warning-counts-hourly',
  '0 * * * *',
  $$
  SELECT public.rollup_warning_counts();
  $$
);