-- Replace the restrictive "no one can delete bot messages" policy with one
-- that still blocks regular/meteorologist deletions but allows the bot
-- account itself to clean up its own outdated outlook posts.
DROP POLICY IF EXISTS "Bot messages cannot be deleted" ON public.messages;

-- Restrictive policy: a bot message may only be deleted by the bot uuid.
CREATE POLICY "Only bot can delete bot messages"
ON public.messages
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (
  badge <> 'System'
  OR user_id = '00000000-0000-0000-0000-000000000000'
);

-- Permissive policy so the anon role (used by the unauthenticated bot
-- insert path) can actually issue the DELETE on its own rows.
DROP POLICY IF EXISTS "Bot can delete its own messages" ON public.messages;
CREATE POLICY "Bot can delete its own messages"
ON public.messages
FOR DELETE
TO anon, authenticated
USING (user_id = '00000000-0000-0000-0000-000000000000');