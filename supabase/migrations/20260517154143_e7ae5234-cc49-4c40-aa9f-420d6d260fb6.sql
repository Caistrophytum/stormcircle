
-- 1. Create the Hurricane Bot auth.users row (mirrors SPC Bot setup).
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
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'hurricanebot@stormcircle.net',
  crypt(gen_random_uuid()::text, gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"system","providers":["system"]}'::jsonb,
  '{"username":"Hurricane Bot"}'::jsonb,
  false,
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- 2. Seed the Hurricane Bot profile.
INSERT INTO public.profiles (id, username, email, badge, meteorologist_applied)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Hurricane Bot',
  'hurricanebot@stormcircle.net',
  'System',
  false
)
ON CONFLICT (id) DO UPDATE
  SET username = EXCLUDED.username,
      badge = EXCLUDED.badge,
      email = EXCLUDED.email;

-- 3. Anyone can view the Hurricane Bot profile.
DROP POLICY IF EXISTS "Anyone can view hurricane bot profile" ON public.profiles;
CREATE POLICY "Anyone can view hurricane bot profile"
ON public.profiles
FOR SELECT
USING (id = '00000000-0000-0000-0000-000000000001');

-- 4. Expand bot insert policy to cover both bot UUIDs.
DROP POLICY IF EXISTS "Bot can insert messages" ON public.messages;
CREATE POLICY "Bot can insert messages"
ON public.messages
FOR INSERT
TO anon, authenticated
WITH CHECK (user_id IN (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid
));

-- 5. Expand bot self-delete policy to cover both bots.
DROP POLICY IF EXISTS "Bot can delete its own messages" ON public.messages;
CREATE POLICY "Bot can delete its own messages"
ON public.messages
FOR DELETE
TO anon, authenticated
USING (user_id IN (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid
));

-- 6. Update the restrictive policy so either bot can delete its own rows.
DROP POLICY IF EXISTS "Only bot can delete bot messages" ON public.messages;
CREATE POLICY "Only bot can delete bot messages"
ON public.messages
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (
  badge <> 'System'
  OR user_id IN (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  )
);
