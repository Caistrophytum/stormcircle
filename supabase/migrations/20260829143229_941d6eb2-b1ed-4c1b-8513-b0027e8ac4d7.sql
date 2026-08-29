ALTER TABLE public.notification_prefs
  ADD COLUMN IF NOT EXISTS chat_messages boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_scope text NOT NULL DEFAULT 'local';

ALTER TABLE public.notification_prefs
  DROP CONSTRAINT IF EXISTS notification_prefs_chat_scope_check;
ALTER TABLE public.notification_prefs
  ADD CONSTRAINT notification_prefs_chat_scope_check CHECK (chat_scope IN ('all','local'));

ALTER TABLE public.notification_state
  ADD COLUMN IF NOT EXISTS last_chat_at timestamptz;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS place_lat numeric,
  ADD COLUMN IF NOT EXISTS place_lon numeric;