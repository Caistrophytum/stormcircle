
-- Fix messages INSERT bypass: drop the permissive "send realtime" policy
DROP POLICY IF EXISTS "Authenticated users can send realtime" ON public.messages;

-- Fix redundant SELECT policy
DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON public.messages;

-- Fix mutable search_path on email queue helpers
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- Restrict SECURITY DEFINER helpers to service_role (they're only called by triggers/edge functions;
-- SECURITY DEFINER runs with definer rights regardless of caller privileges)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_cron_secret(text) FROM PUBLIC, anon, authenticated;
