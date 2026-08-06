ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS duplicated_from uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS listings_vehicle_platform_account_uidx
  ON public.listings (vehicle_id, platform, COALESCE(account_key, ''));