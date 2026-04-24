
-- 1. Remove duplicate trigger (both do the same thing).
DROP TRIGGER IF EXISTS prevent_meteorologist_reapply_trg ON public.profiles;

-- 2. Defense-in-depth at the RLS level: the WITH CHECK clause now blocks
--    badge self-modification, so even if the trigger were ever dropped,
--    the policy itself would prevent escalation.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND badge = (SELECT badge FROM public.profiles WHERE id = auth.uid())
  AND meteorologist_applied >= (SELECT meteorologist_applied FROM public.profiles WHERE id = auth.uid())
);
