-- 1. Create the bot's auth.users row (required because profiles.id references auth.users).
--    Using a deterministic UUID; the account has no usable password and email is disabled.
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'bot@stormcircle.net',
  crypt(gen_random_uuid()::text, gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"system","providers":["system"]}'::jsonb,
  '{"username":"SPC Bot"}'::jsonb,
  false,
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- 2. Seed the reserved SPC Bot profile (handle_new_user trigger may have already
--    inserted a row from the auth.users insert above; upsert to set badge).
INSERT INTO public.profiles (id, username, email, badge, meteorologist_applied)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'SPC Bot',
  'bot@stormcircle.net',
  'System',
  false
)
ON CONFLICT (id) DO UPDATE
  SET username = EXCLUDED.username,
      badge = EXCLUDED.badge,
      email = EXCLUDED.email;

-- 3. Allow anyone to read the bot profile.
DROP POLICY IF EXISTS "Anyone can view bot profile" ON public.profiles;
CREATE POLICY "Anyone can view bot profile"
ON public.profiles
FOR SELECT
USING (id = '00000000-0000-0000-0000-000000000000');

-- 4. Allow inserting messages under the reserved bot uuid without a session.
DROP POLICY IF EXISTS "Bot can insert messages" ON public.messages;
CREATE POLICY "Bot can insert messages"
ON public.messages
FOR INSERT
TO anon, authenticated
WITH CHECK (user_id = '00000000-0000-0000-0000-000000000000');

-- 5. Block deletion of bot messages.
DROP POLICY IF EXISTS "Bot messages cannot be deleted" ON public.messages;
CREATE POLICY "Bot messages cannot be deleted"
ON public.messages
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (badge <> 'System');

-- 6. Replace the cron cleanup job to skip System (bot) messages.
SELECT cron.unschedule('delete-old-messages')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-old-messages');

SELECT cron.schedule(
  'delete-old-messages',
  '*/5 * * * *',
  $$
    delete from public.messages
    where created_at < now() - interval '2 hours'
      and badge <> 'System';
  $$
);