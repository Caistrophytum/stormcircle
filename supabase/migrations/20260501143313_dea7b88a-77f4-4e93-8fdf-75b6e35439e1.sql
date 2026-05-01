-- When a profiles row is deleted (e.g. by an admin), also delete the
-- corresponding auth.users row. Cascade from auth.users -> profiles already
-- exists; this trigger guards against re-entry by checking if the auth user
-- still exists before deleting.
CREATE OR REPLACE FUNCTION public.delete_auth_user_on_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only delete if the auth.users row still exists. This prevents an
  -- infinite loop when the deletion was initiated by auth.users cascading
  -- to profiles.
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.id) THEN
    DELETE FROM auth.users WHERE id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_deleted_remove_auth_user ON public.profiles;
CREATE TRIGGER on_profile_deleted_remove_auth_user
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_auth_user_on_profile_delete();