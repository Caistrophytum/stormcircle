-- Topic approvals: a single row per approved "signature" string.
CREATE TABLE IF NOT EXISTS public.report_approvals (
  signature text PRIMARY KEY,
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.report_approvals ENABLE ROW LEVEL SECURITY;

-- Anyone (including guests) can see which topics are approved.
CREATE POLICY "Anyone can read approvals"
  ON public.report_approvals FOR SELECT
  USING (true);

-- Only Meteorologists can approve a topic.
CREATE POLICY "Meteorologists can approve"
  ON public.report_approvals FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_meteorologist(auth.uid())
    AND approved_by = auth.uid()
  );

-- Only Meteorologists can remove an approval.
CREATE POLICY "Meteorologists can unapprove"
  ON public.report_approvals FOR DELETE
  TO authenticated
  USING (public.is_meteorologist(auth.uid()));

-- Realtime so approval badges sync live.
ALTER TABLE public.report_approvals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.report_approvals;

-- ── Auto-approve Meteorologist messages ───────────────────────────────
-- Helper: build a stable signature from message content (lowercased,
-- non-alpha stripped, sorted unique tokens, joined with "|"). Mirrors the
-- client's signature so the rows match up.
CREATE OR REPLACE FUNCTION public.message_signature(_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    string_agg(t, '|' ORDER BY t),
    ''
  )
  FROM (
    SELECT DISTINCT regexp_replace(lower(unnest), '[^a-z0-9]', '', 'g') AS t
    FROM unnest(regexp_split_to_array(lower(_content), '\s+'))
    WHERE length(regexp_replace(lower(unnest), '[^a-z0-9]', '', 'g')) > 0
  ) toks;
$$;

CREATE OR REPLACE FUNCTION public.auto_approve_meteorologist_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sig text;
BEGIN
  IF NEW.badge = 'Meteorologist' THEN
    sig := public.message_signature(NEW.content);
    IF sig <> '' THEN
      INSERT INTO public.report_approvals (signature, approved_by)
      VALUES (sig, NEW.user_id)
      ON CONFLICT (signature) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_approve_met_message ON public.messages;
CREATE TRIGGER trg_auto_approve_met_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.auto_approve_meteorologist_message();