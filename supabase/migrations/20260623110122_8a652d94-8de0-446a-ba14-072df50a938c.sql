ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS new_sync_email_status text,
  ADD COLUMN IF NOT EXISTS new_sync_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS new_sync_email_error text,
  ADD COLUMN IF NOT EXISTS new_sync_email_last_attempt_at timestamptz;