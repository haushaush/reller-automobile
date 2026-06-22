
CREATE POLICY "Admins read mobile-ad-images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'mobile-ad-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert mobile-ad-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'mobile-ad-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update mobile-ad-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'mobile-ad-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'mobile-ad-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete mobile-ad-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'mobile-ad-images' AND public.has_role(auth.uid(), 'admin'));
