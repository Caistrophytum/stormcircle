CREATE TABLE IF NOT EXISTS public.feed_http_cache (
  feed_key text PRIMARY KEY,
  etag text,
  last_modified text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.feed_http_cache TO service_role;

ALTER TABLE public.feed_http_cache ENABLE ROW LEVEL SECURITY;