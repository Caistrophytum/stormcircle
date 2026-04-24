
-- 1. Tighten message INSERT: only Meteorologists may post.
DROP POLICY IF EXISTS "Logged in users can insert" ON public.messages;
CREATE POLICY "Only meteorologists can insert messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_meteorologist(auth.uid()));

-- 2. Tighten message DELETE: only Meteorologists may delete (any message).
DROP POLICY IF EXISTS "Users can delete own messages or moderators delete any" ON public.messages;
CREATE POLICY "Only meteorologists can delete messages"
ON public.messages
FOR DELETE
TO authenticated
USING (public.is_meteorologist(auth.uid()));

-- 3. Prevent badge self-modification on profiles (privilege escalation fix).
--    The existing trigger prevent_meteorologist_reapply already blocks badge
--    changes from authenticated users; ensure it is attached.
DROP TRIGGER IF EXISTS prevent_meteorologist_reapply_trigger ON public.profiles;
CREATE TRIGGER prevent_meteorologist_reapply_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_meteorologist_reapply();
