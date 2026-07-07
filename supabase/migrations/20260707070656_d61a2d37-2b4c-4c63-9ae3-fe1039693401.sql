
-- 1) Defense-in-depth for profile badge/application escalation.
--    The existing UPDATE policy already pins these columns to their prior
--    values via a subquery, and the prevent_meteorologist_reapply trigger
--    blocks user changes. Add column-level revokes so the columns can't be
--    written from the Data API at all — the request is rejected before RLS
--    or trigger evaluation, closing any theoretical policy-evaluation edge
--    case flagged by the scanner.
REVOKE UPDATE (badge, meteorologist_applied) ON public.profiles FROM authenticated;
REVOKE UPDATE (badge, meteorologist_applied) ON public.profiles FROM anon;

-- 2) SECURITY DEFINER functions: remove EXECUTE from roles that should never
--    invoke them directly. service_role and postgres retain access.
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;

-- delete_user is intentionally callable by signed-in users (self-deletion).
-- Anon has no user to delete, so revoke there.
REVOKE EXECUTE ON FUNCTION public.delete_user() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_user() TO authenticated;

-- is_meteorologist is used inside RLS policies. RLS policy evaluation uses
-- the function owner's privileges, so revoking PUBLIC/anon exec doesn't
-- break policies; it just prevents unauthenticated direct RPC calls.
REVOKE EXECUTE ON FUNCTION public.is_meteorologist(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_meteorologist(uuid) TO authenticated;

-- 3) Realtime channel authorization. The app only uses postgres_changes
--    (which authorizes via the underlying table's RLS), so restricting
--    realtime.messages to authenticated users is safe and blocks anonymous
--    or unauthorized Broadcast/Presence subscriptions.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can receive realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can send realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can send realtime"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (true);
