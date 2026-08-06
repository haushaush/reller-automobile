ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE INDEX IF NOT EXISTS idx_vehicles_archived_at ON public.vehicles (archived_at);

DROP POLICY IF EXISTS "Vehicles are publicly readable" ON public.vehicles;
CREATE POLICY "Vehicles are publicly readable"
  ON public.vehicles FOR SELECT TO anon
  USING (is_test = false AND archived_at IS NULL);

CREATE TABLE public.vehicle_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  title text NOT NULL,
  mobile_ad_ids text[] NOT NULL DEFAULT '{}',
  price integer,
  action text NOT NULL CHECK (action IN ('archived','deleted','restored')),
  reason text,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT, INSERT ON public.vehicle_deletion_log TO authenticated;
GRANT ALL ON public.vehicle_deletion_log TO service_role;

ALTER TABLE public.vehicle_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read deletion log"
  ON public.vehicle_deletion_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can write deletion log"
  ON public.vehicle_deletion_log FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_vehicle_deletion_log_vehicle ON public.vehicle_deletion_log (vehicle_id);