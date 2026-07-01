DROP POLICY IF EXISTS "Logged in users can insert" ON public.messages;
CREATE POLICY "Logged in users can insert" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND user_id NOT IN (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  )
);