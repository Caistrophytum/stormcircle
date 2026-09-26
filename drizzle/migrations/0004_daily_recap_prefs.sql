ALTER TABLE public.notification_prefs
  ADD COLUMN IF NOT EXISTS daily_recap boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recap_hour smallint NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS recap_exercise boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recap_activities text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.notification_prefs
  ADD CONSTRAINT notification_prefs_recap_hour_range CHECK (recap_hour BETWEEN 4 AND 11);
ALTER TABLE public.notification_state
  ADD COLUMN IF NOT EXISTS last_recap_date date;