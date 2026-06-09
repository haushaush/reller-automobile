
CREATE POLICY "Public can read vehicle-exposes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vehicle-exposes');

CREATE POLICY "Admins can upload vehicle-exposes"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vehicle-exposes' AND public.current_user_is_admin());

CREATE POLICY "Admins can update vehicle-exposes"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'vehicle-exposes' AND public.current_user_is_admin());

CREATE POLICY "Admins can delete vehicle-exposes"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'vehicle-exposes' AND public.current_user_is_admin());
