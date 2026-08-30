CREATE TABLE IF NOT EXISTS public.warning_regions (
  code text PRIMARY KEY,
  country text,
  name text,
  geometry jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.warning_regions TO service_role;
ALTER TABLE public.warning_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages warning regions" ON public.warning_regions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');