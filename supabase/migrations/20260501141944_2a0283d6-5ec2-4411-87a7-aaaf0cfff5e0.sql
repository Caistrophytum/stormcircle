-- Cascade delete user data when an auth user is removed.
-- profiles.id references auth.users(id); messages.user_id and report_approvals.approved_by also reference users.

-- profiles
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- messages
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_user_id_fkey;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- report_approvals
ALTER TABLE public.report_approvals
  DROP CONSTRAINT IF EXISTS report_approvals_approved_by_fkey;
ALTER TABLE public.report_approvals
  ADD CONSTRAINT report_approvals_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE CASCADE;