ALTER TABLE public.sync_logs
  ADD COLUMN IF NOT EXISTS pages_fetched integer,
  ADD COLUMN IF NOT EXISTS page_size integer,
  ADD COLUMN IF NOT EXISTS mobile_total_results integer,
  ADD COLUMN IF NOT EXISTS stop_reason text;

ALTER TABLE public.sync_logs DROP CONSTRAINT IF EXISTS sync_logs_status_check;
ALTER TABLE public.sync_logs ADD CONSTRAINT sync_logs_status_check
  CHECK (status = ANY (ARRAY['running','success','success_with_warning','failed','skipped']));