
CREATE TABLE public.mobile_ad_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  mobile_ad_id TEXT NULL,
  image_paths TEXT[] NULL,
  error_message TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobile_ad_drafts TO authenticated;
GRANT ALL ON public.mobile_ad_drafts TO service_role;

ALTER TABLE public.mobile_ad_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view mobile ad drafts"
  ON public.mobile_ad_drafts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert mobile ad drafts"
  ON public.mobile_ad_drafts FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update mobile ad drafts"
  ON public.mobile_ad_drafts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete mobile ad drafts"
  ON public.mobile_ad_drafts FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_mobile_ad_drafts_updated_at
  BEFORE UPDATE ON public.mobile_ad_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_mobile_ad_drafts_status ON public.mobile_ad_drafts(status);
CREATE INDEX idx_mobile_ad_drafts_created_at ON public.mobile_ad_drafts(created_at DESC);
