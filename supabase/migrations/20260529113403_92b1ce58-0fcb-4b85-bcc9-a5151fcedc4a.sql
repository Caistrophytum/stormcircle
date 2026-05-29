INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'fire-bot@stormcircle.net',
  crypt(gen_random_uuid()::text, gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"system","providers":["system"]}'::jsonb,
  '{"username":"Fire Weather Bot"}'::jsonb,
  false, '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, username, email, badge)
VALUES ('00000000-0000-0000-0000-000000000002', 'Fire Weather Bot', 'fire-bot@stormcircle.net', 'System')
ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, badge = EXCLUDED.badge;