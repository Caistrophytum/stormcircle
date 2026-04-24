-- Force the username and badge stored on a message to match the sender's
-- own profile, regardless of what the client sent. RLS already requires
-- auth.uid() = user_id on insert, so this trigger trusts user_id.
CREATE OR REPLACE FUNCTION public.enforce_message_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_username text;
  p_badge text;
BEGIN
  SELECT username, badge INTO p_username, p_badge
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF p_username IS NULL THEN
    RAISE EXCEPTION 'No profile found for user %', NEW.user_id;
  END IF;

  NEW.username := p_username;
  NEW.badge := p_badge;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_message_identity ON public.messages;
CREATE TRIGGER trg_enforce_message_identity
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_message_identity();

-- Helps the trigger-driven moderator feed and any future "by badge" sort.
CREATE INDEX IF NOT EXISTS messages_badge_created_at_idx
  ON public.messages (badge, created_at DESC);