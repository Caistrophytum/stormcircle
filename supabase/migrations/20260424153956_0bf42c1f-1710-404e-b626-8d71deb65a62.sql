
DROP POLICY IF EXISTS "Only meteorologists can insert messages" ON public.messages;
CREATE POLICY "Logged in users can insert"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
