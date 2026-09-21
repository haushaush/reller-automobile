ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS mobile_live_at timestamptz,
  ADD COLUMN IF NOT EXISTS mobile_missing_since timestamptz;
CREATE INDEX IF NOT EXISTS vehicles_mobile_missing_since_idx ON public.vehicles (mobile_missing_since);