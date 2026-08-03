
-- 1) Fix mutable search_path on SECURITY DEFINER functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;

-- 2) Revoke EXECUTE from anon/authenticated on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;

-- role helpers: only signed-in users need them (used inside RLS policies)
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated, service_role;

-- 3) Scope admin policies to authenticated so anon never evaluates the helpers
DROP POLICY IF EXISTS "Admins can delete inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Admins can update inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Admins can view inquiries" ON public.inquiries;
CREATE POLICY "Admins can view inquiries" ON public.inquiries FOR SELECT TO authenticated USING (public.current_user_is_admin());
CREATE POLICY "Admins can update inquiries" ON public.inquiries FOR UPDATE TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE POLICY "Admins can delete inquiries" ON public.inquiries FOR DELETE TO authenticated USING (public.current_user_is_admin());

DROP POLICY IF EXISTS "Admins can delete alerts" ON public.vehicle_alerts;
DROP POLICY IF EXISTS "Admins can update alerts" ON public.vehicle_alerts;
DROP POLICY IF EXISTS "Admins can view alerts" ON public.vehicle_alerts;
CREATE POLICY "Admins can view alerts" ON public.vehicle_alerts FOR SELECT TO authenticated USING (public.current_user_is_admin());
CREATE POLICY "Admins can update alerts" ON public.vehicle_alerts FOR UPDATE TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE POLICY "Admins can delete alerts" ON public.vehicle_alerts FOR DELETE TO authenticated USING (public.current_user_is_admin());

-- 4) vehicle_exposes: no public read
DROP POLICY IF EXISTS "Exposes are publicly readable" ON public.vehicle_exposes;
DROP POLICY IF EXISTS "Admins can insert exposes" ON public.vehicle_exposes;
DROP POLICY IF EXISTS "Admins can update exposes" ON public.vehicle_exposes;
DROP POLICY IF EXISTS "Admins can delete exposes" ON public.vehicle_exposes;
CREATE POLICY "Admins can view exposes" ON public.vehicle_exposes FOR SELECT TO authenticated USING (public.current_user_is_admin());
CREATE POLICY "Admins can insert exposes" ON public.vehicle_exposes FOR INSERT TO authenticated WITH CHECK (public.current_user_is_admin());
CREATE POLICY "Admins can update exposes" ON public.vehicle_exposes FOR UPDATE TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE POLICY "Admins can delete exposes" ON public.vehicle_exposes FOR DELETE TO authenticated USING (public.current_user_is_admin());
REVOKE SELECT ON public.vehicle_exposes FROM anon;

-- 5) vehicle_stories: no public read (hides internal user ids)
DROP POLICY IF EXISTS "Stories are publicly readable" ON public.vehicle_stories;
DROP POLICY IF EXISTS "Admins can insert stories" ON public.vehicle_stories;
DROP POLICY IF EXISTS "Admins can update stories" ON public.vehicle_stories;
DROP POLICY IF EXISTS "Admins can delete stories" ON public.vehicle_stories;
CREATE POLICY "Admins can view stories" ON public.vehicle_stories FOR SELECT TO authenticated USING (public.current_user_is_admin());
CREATE POLICY "Admins can insert stories" ON public.vehicle_stories FOR INSERT TO authenticated WITH CHECK (public.current_user_is_admin());
CREATE POLICY "Admins can update stories" ON public.vehicle_stories FOR UPDATE TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE POLICY "Admins can delete stories" ON public.vehicle_stories FOR DELETE TO authenticated USING (public.current_user_is_admin());
REVOKE SELECT ON public.vehicle_stories FROM anon;

-- 6) storage: lock down writes to the public vehicle-stories bucket
DROP POLICY IF EXISTS "Service role can write story images" ON storage.objects;
CREATE POLICY "Admins can upload story images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-stories' AND public.current_user_is_admin());
CREATE POLICY "Admins can update story images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-stories' AND public.current_user_is_admin())
  WITH CHECK (bucket_id = 'vehicle-stories' AND public.current_user_is_admin());

-- vehicle-exposes storage: private bucket, remove broad public read
DROP POLICY IF EXISTS "Public can read vehicle-exposes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload vehicle-exposes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update vehicle-exposes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete vehicle-exposes" ON storage.objects;
CREATE POLICY "Admins can read vehicle-exposes" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-exposes' AND public.current_user_is_admin());
CREATE POLICY "Admins can upload vehicle-exposes" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-exposes' AND public.current_user_is_admin());
CREATE POLICY "Admins can update vehicle-exposes" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-exposes' AND public.current_user_is_admin())
  WITH CHECK (bucket_id = 'vehicle-exposes' AND public.current_user_is_admin());
CREATE POLICY "Admins can delete vehicle-exposes" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vehicle-exposes' AND public.current_user_is_admin());

-- public story bucket: allow read of story image objects only, not arbitrary listing of other prefixes
DROP POLICY IF EXISTS "Story images publicly readable" ON storage.objects;
CREATE POLICY "Story images publicly readable" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'vehicle-stories');
