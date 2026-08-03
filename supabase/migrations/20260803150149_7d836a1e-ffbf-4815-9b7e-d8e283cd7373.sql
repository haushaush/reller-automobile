INSERT INTO public.sync_locks (lock_name, locked_at, locked_until)
VALUES
  ('mobile-de-reconcile', now() - interval '1 hour', now() - interval '1 hour'),
  ('mobile-de-reconcile-accident', now() - interval '1 hour', now() - interval '1 hour')
ON CONFLICT (lock_name) DO NOTHING;

ALTER TABLE public.sync_logs DROP CONSTRAINT IF EXISTS sync_logs_status_check;
ALTER TABLE public.sync_logs
  ADD CONSTRAINT sync_logs_status_check
  CHECK (status IN ('running', 'success', 'success_with_warning', 'failed', 'error', 'skipped', 'aborted'));

UPDATE public.sync_logs
SET status = 'aborted',
    completed_at = now(),
    duration_ms = LEAST(2147483647::numeric, GREATEST(0::numeric, FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) * 1000)))::integer,
    error_message = 'Lauf ohne Abschluss beendet'
WHERE status = 'running'
  AND started_at < now() - interval '15 minutes';