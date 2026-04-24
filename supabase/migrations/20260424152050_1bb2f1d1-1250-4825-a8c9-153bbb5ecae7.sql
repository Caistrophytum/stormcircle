-- Helper: check a user's badge without recursing into profiles RLS.
CREATE OR REPLACE FUNCTION public.is_meteorologist(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND badge = 'Meteorologist'
  );
$$;

-- Replace the delete policy: own messages OR any message if Meteorologist.
DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;

CREATE POLICY "Users can delete own messages or moderators delete any"
ON public.messages
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_meteorologist(auth.uid())
);