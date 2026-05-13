
-- Inquiries: admins full access
CREATE POLICY "Admins can view inquiries" ON public.inquiries FOR SELECT USING (current_user_is_admin());
CREATE POLICY "Admins can update inquiries" ON public.inquiries FOR UPDATE USING (current_user_is_admin());
CREATE POLICY "Admins can delete inquiries" ON public.inquiries FOR DELETE USING (current_user_is_admin());

-- Inquiry vehicles
CREATE POLICY "Admins can view inquiry_vehicles" ON public.inquiry_vehicles FOR SELECT USING (current_user_is_admin());
CREATE POLICY "Admins can delete inquiry_vehicles" ON public.inquiry_vehicles FOR DELETE USING (current_user_is_admin());

-- Vehicle alerts
CREATE POLICY "Admins can view alerts" ON public.vehicle_alerts FOR SELECT USING (current_user_is_admin());
CREATE POLICY "Admins can update alerts" ON public.vehicle_alerts FOR UPDATE USING (current_user_is_admin());
CREATE POLICY "Admins can delete alerts" ON public.vehicle_alerts FOR DELETE USING (current_user_is_admin());

-- Sync logs (admin read)
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view sync_logs" ON public.sync_logs FOR SELECT USING (current_user_is_admin());
