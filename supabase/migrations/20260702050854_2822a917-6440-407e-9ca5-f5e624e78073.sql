CREATE INDEX IF NOT EXISTS messages_user_id_idx
  ON public.messages (user_id);

CREATE INDEX IF NOT EXISTS zone_geom_cache_fetched_at_idx
  ON public.zone_geom_cache (fetched_at);