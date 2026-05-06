-- Sync lock table to prevent overlapping syncs
CREATE TABLE IF NOT EXISTS public.sync_locks (
  lock_name TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ NOT NULL
);

INSERT INTO public.sync_locks (lock_name, locked_at, locked_until)
VALUES
  ('sync-vehicles', now() - interval '1 hour', now() - interval '1 hour'),
  ('sync-accident-vehicles', now() - interval '1 hour', now() - interval '1 hour')
ON CONFLICT (lock_name) DO NOTHING;

ALTER TABLE public.sync_locks ENABLE ROW LEVEL SECURITY;
-- No public policies: only service role (which bypasses RLS) may access.

-- Sync logs for monitoring
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  vehicles_total INTEGER,
  vehicles_added INTEGER,
  vehicles_updated INTEGER,
  vehicles_marked_sold INTEGER,
  status TEXT CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON public.sync_logs(started_at DESC);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
-- No public policies: only service role (bypasses RLS) may read/write.