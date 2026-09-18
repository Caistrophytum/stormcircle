-- Perf: alerts-poll currently rewrites every active_alerts row once a minute,
-- including the ~12KB geometry payload, even when the upstream NWS record is
-- byte-identical. That burned ~570s of DB time, bloated the table, and fired
-- ~520 realtime events per minute at every connected browser.
--
-- content_hash lets the poller compare a cheap fingerprint and upsert only
-- rows whose upstream content actually changed.
ALTER TABLE public.active_alerts
  ADD COLUMN IF NOT EXISTS content_hash text;

-- Trend bar reads warning_daily_counts ordered by day on every desktop load.
CREATE INDEX IF NOT EXISTS warning_daily_counts_day_idx
  ON public.warning_daily_counts (day DESC);