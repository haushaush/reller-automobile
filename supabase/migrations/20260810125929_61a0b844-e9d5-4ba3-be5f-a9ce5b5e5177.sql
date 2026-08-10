CREATE POLICY "Verkaeuferfotos sind lesbar"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'sales-contact-photos');

CREATE POLICY "Administratoren laden Verkaeuferfotos hoch"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sales-contact-photos' AND public.current_user_is_admin());

CREATE POLICY "Administratoren aendern Verkaeuferfotos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'sales-contact-photos' AND public.current_user_is_admin())
  WITH CHECK (bucket_id = 'sales-contact-photos' AND public.current_user_is_admin());

CREATE POLICY "Administratoren loeschen Verkaeuferfotos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sales-contact-photos' AND public.current_user_is_admin());