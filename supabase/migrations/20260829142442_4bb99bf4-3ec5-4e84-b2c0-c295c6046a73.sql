CREATE TABLE IF NOT EXISTS public.site_visitors (
  visitor_id uuid PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_visitors TO anon, authenticated;
GRANT ALL ON public.site_visitors TO service_role;

ALTER TABLE public.site_visitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct reads of visitors" ON public.site_visitors;
CREATE POLICY "Service role manages visitors" ON public.site_visitors
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.register_visit(_visitor_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total bigint;
BEGIN
  INSERT INTO public.site_visitors (visitor_id)
  VALUES (_visitor_id)
  ON CONFLICT (visitor_id) DO UPDATE SET last_seen_at = now();

  SELECT count(*) INTO total FROM public.site_visitors;
  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION public.register_visit(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.register_visit(uuid) TO anon, authenticated, service_role;