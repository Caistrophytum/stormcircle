
DELETE FROM cron.job_run_details
WHERE end_time < now() - interval '3 days'
   OR (end_time IS NULL AND start_time < now() - interval '3 days');

SELECT cron.schedule(
  'cleanup-cron-history-weekly',
  '5 0 * * 0',
  $$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days' OR (end_time IS NULL AND start_time < now() - interval '3 days'); $$
);
