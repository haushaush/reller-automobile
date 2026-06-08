
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'mobile_de',
  ADD COLUMN IF NOT EXISTS vin text NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_source ON public.vehicles(source);

-- Public read on vehicle-images bucket (images are referenced publicly in listings)
CREATE POLICY "Public can read vehicle-images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'vehicle-images');

CREATE POLICY "Admins can upload vehicle-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'vehicle-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update vehicle-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'vehicle-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete vehicle-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'vehicle-images' AND public.has_role(auth.uid(), 'admin'));
