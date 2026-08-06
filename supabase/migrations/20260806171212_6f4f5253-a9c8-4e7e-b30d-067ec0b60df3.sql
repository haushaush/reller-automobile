CREATE POLICY "Admins read deletion log images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'deletion-log' AND public.has_role(auth.uid(), 'admin'));