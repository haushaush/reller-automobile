ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reserved_note text,
  ADD COLUMN IF NOT EXISTS image_order text[],
  ADD COLUMN IF NOT EXISTS custom_image_urls text[],
  ADD COLUMN IF NOT EXISTS hidden_image_urls text[],
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.vehicle_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  field text,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_audit_log_vehicle ON public.vehicle_audit_log(vehicle_id, created_at DESC);

GRANT SELECT, INSERT ON public.vehicle_audit_log TO authenticated;
GRANT ALL ON public.vehicle_audit_log TO service_role;

ALTER TABLE public.vehicle_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.vehicle_audit_log FOR SELECT TO authenticated
  USING (public.current_user_is_admin());

CREATE POLICY "Authenticated can insert audit log"
  ON public.vehicle_audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);