ALTER TABLE public.vehicle_deletion_log
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS model_description text,
  ADD COLUMN IF NOT EXISTS vehicle_category text,
  ADD COLUMN IF NOT EXISTS first_registration text,
  ADD COLUMN IF NOT EXISTS mileage integer,
  ADD COLUMN IF NOT EXISTS vin text,
  ADD COLUMN IF NOT EXISTS internal_number text,
  ADD COLUMN IF NOT EXISTS mobile_ad_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS platforms jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS was_sold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS was_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vehicle_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

CREATE INDEX IF NOT EXISTS vehicle_deletion_log_deleted_idx
  ON public.vehicle_deletion_log (performed_at DESC);

ALTER TABLE public.listing_tasks
  ALTER COLUMN vehicle_id DROP NOT NULL;

ALTER TABLE public.listing_tasks
  ADD COLUMN IF NOT EXISTS platform public.listing_platform,
  ADD COLUMN IF NOT EXISTS ad_title text,
  ADD COLUMN IF NOT EXISTS ad_url text;