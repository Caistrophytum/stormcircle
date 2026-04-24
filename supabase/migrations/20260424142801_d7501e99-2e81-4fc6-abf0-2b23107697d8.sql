-- Server-side guard: prevent users from re-submitting a meteorologist application.
-- Once meteorologist_applied is set to true, it can only be changed by an admin
-- (or the auth.uid() check failing means the request is from a service role/postgres,
-- which bypasses RLS anyway). Users can never flip it back to false themselves,
-- and they cannot unset their badge.
CREATE OR REPLACE FUNCTION public.prevent_meteorologist_reapply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the request comes from an authenticated end user.
  -- Service-role / superuser updates (auth.uid() IS NULL) are allowed.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Block users from resetting their own application flag back to false.
  IF OLD.meteorologist_applied = true AND NEW.meteorologist_applied = false THEN
    RAISE EXCEPTION 'meteorologist_applied cannot be unset by the user';
  END IF;

  -- Block users from changing their own badge (only admins should do this).
  IF OLD.badge IS DISTINCT FROM NEW.badge THEN
    RAISE EXCEPTION 'badge cannot be changed by the user';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_meteorologist_reapply_trg ON public.profiles;
CREATE TRIGGER prevent_meteorologist_reapply_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_meteorologist_reapply();