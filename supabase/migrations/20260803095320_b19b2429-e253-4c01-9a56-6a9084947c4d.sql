DROP POLICY IF EXISTS "Authenticated users can send realtime" ON public.messages;
DROP POLICY IF EXISTS "Anyone can read approvals" ON public.report_approvals;
CREATE POLICY "Authenticated users can read approvals"
  ON public.report_approvals FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.report_approvals FROM anon;