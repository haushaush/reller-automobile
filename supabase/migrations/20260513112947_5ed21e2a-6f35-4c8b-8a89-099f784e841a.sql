CREATE POLICY "Admins can delete vehicle story files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vehicle-stories' AND public.current_user_is_admin());