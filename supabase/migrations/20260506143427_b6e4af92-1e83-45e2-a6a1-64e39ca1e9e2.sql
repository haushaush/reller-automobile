ALTER TABLE public.vehicle_alerts
  ADD COLUMN IF NOT EXISTS message TEXT;

ALTER TABLE public.vehicle_alerts
  DROP CONSTRAINT IF EXISTS message_length;

ALTER TABLE public.vehicle_alerts
  ADD CONSTRAINT message_length CHECK (message IS NULL OR length(message) <= 1000);