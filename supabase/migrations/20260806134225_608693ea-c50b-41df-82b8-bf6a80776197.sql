ALTER TABLE public.listing_tasks ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.vehicle_collages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_collages TO authenticated;
GRANT ALL ON public.vehicle_collages TO service_role;

ALTER TABLE public.vehicle_collages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage vehicle collages"
  ON public.vehicle_collages FOR ALL
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE INDEX IF NOT EXISTS idx_vehicle_collages_vehicle ON public.vehicle_collages(vehicle_id);