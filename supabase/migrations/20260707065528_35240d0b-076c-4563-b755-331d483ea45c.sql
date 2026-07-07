
DROP POLICY IF EXISTS "Bot can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Bot can delete its own messages" ON public.messages;

DROP POLICY IF EXISTS "Logged in users can insert" ON public.messages;
CREATE POLICY "Logged in users can insert"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND user_id NOT IN (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  )
);
