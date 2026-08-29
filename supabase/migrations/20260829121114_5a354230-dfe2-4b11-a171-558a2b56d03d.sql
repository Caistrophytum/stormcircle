-- Restrict authenticated reads of report_approvals to the signature column only.
-- The app only needs to know WHICH report topics are verified; the approving
-- meteorologist's identity and timestamp must stay private.
REVOKE SELECT ON public.report_approvals FROM authenticated;
GRANT SELECT (signature) ON public.report_approvals TO authenticated;

-- Realtime payloads bypass column privileges when REPLICA IDENTITY is FULL.
-- Fall back to the primary key (signature), so DELETE events expose nothing else.
ALTER TABLE public.report_approvals REPLICA IDENTITY DEFAULT;