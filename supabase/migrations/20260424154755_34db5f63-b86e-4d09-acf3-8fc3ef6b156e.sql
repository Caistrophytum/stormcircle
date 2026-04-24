
CREATE OR REPLACE FUNCTION public.cleanup_orphan_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sig text;
BEGIN
  sig := public.message_signature(OLD.content);
  IF sig = '' THEN
    RETURN OLD;
  END IF;

  -- Only delete the approval when no other message with the same signature
  -- still exists. Otherwise the topic is still alive.
  IF NOT EXISTS (
    SELECT 1
    FROM public.messages
    WHERE public.message_signature(content) = sig
  ) THEN
    DELETE FROM public.report_approvals WHERE signature = sig;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_orphan_approval_trg ON public.messages;
CREATE TRIGGER cleanup_orphan_approval_trg
AFTER DELETE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_orphan_approval();
