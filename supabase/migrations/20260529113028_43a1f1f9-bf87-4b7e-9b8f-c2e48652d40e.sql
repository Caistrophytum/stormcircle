CREATE TABLE public.fire_outlook_state (
  id integer PRIMARY KEY DEFAULT 1,
  issue text,
  groups jsonb,
  dry_thunder jsonb,
  hazards jsonb,
  summary text,
  valid_window jsonb,
  discussion text,
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fire_outlook_state_singleton CHECK (id = 1)
);

GRANT SELECT ON public.fire_outlook_state TO anon, authenticated;
GRANT ALL ON public.fire_outlook_state TO service_role;

ALTER TABLE public.fire_outlook_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read fire outlook"
  ON public.fire_outlook_state FOR SELECT
  USING (true);

CREATE POLICY "Service role can write fire outlook"
  ON public.fire_outlook_state FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.fire_outlook_state (id) VALUES (1) ON CONFLICT DO NOTHING;
