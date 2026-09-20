-- Historical buckets were written before region classification existed, so
-- every European warning was stored under the US region. Rebuild the EU
-- buckets from the live alert table and remove those counts from US rows.
WITH eu AS (
  SELECT event,
         ((first_seen_at AT TIME ZONE 'UTC') - interval '12 hours')::date AS day,
         count(*)::int AS cnt
  FROM public.active_alerts
  WHERE alert_id LIKE 'MA-%'
    AND event IS NOT NULL
    AND (
      lower(event) LIKE '%warning%'
      OR lower(event) LIKE '%watch%'
      OR lower(event) LIKE '%emergency%'
      OR lower(event) LIKE '%evacuation%'
      OR lower(event) LIKE '%shelter%'
    )
  GROUP BY 1, 2
),
ins AS (
  INSERT INTO public.warning_daily_counts (event, day, region, count, updated_at)
  SELECT event, day, 'EU', cnt, now() FROM eu
  ON CONFLICT (event, day, region)
  DO UPDATE SET count = GREATEST(public.warning_daily_counts.count, EXCLUDED.count),
                updated_at = EXCLUDED.updated_at
  RETURNING 1
)
UPDATE public.warning_daily_counts w
SET count = GREATEST(w.count - eu.cnt, 0)
FROM eu
WHERE w.region = 'US' AND w.event = eu.event AND w.day = eu.day;

DELETE FROM public.warning_daily_counts WHERE count = 0;