
CREATE TABLE public.vehicle_exposes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL UNIQUE,
  pdf_url text NOT NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vehicle_exposes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_exposes TO authenticated;
GRANT ALL ON public.vehicle_exposes TO service_role;

ALTER TABLE public.vehicle_exposes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Exposes are publicly readable"
  ON public.vehicle_exposes FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert exposes"
  ON public.vehicle_exposes FOR INSERT
  WITH CHECK (current_user_is_admin());

CREATE POLICY "Admins can update exposes"
  ON public.vehicle_exposes FOR UPDATE
  USING (current_user_is_admin());

CREATE POLICY "Admins can delete exposes"
  ON public.vehicle_exposes FOR DELETE
  USING (current_user_is_admin());

CREATE TRIGGER update_vehicle_exposes_updated_at
  BEFORE UPDATE ON public.vehicle_exposes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
