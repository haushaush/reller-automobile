
DROP POLICY IF EXISTS "Anyone can create inquiries" ON public.inquiries;
CREATE POLICY "Anyone can create inquiries" ON public.inquiries FOR INSERT TO anon, authenticated
WITH CHECK (
  gdpr_accepted = true
  AND length(first_name) BETWEEN 1 AND 100
  AND length(last_name) BETWEEN 1 AND 100
  AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND length(email) <= 320
  AND (phone IS NULL OR length(phone) <= 50)
  AND (message IS NULL OR length(message) <= 5000)
  AND status = 'new'
);

DROP POLICY IF EXISTS "Anyone can create alerts" ON public.vehicle_alerts;
CREATE POLICY "Anyone can create alerts" ON public.vehicle_alerts FOR INSERT TO anon, authenticated
WITH CHECK (
  email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND length(email) <= 320
  AND (name IS NULL OR length(name) <= 100)
  AND (brand IS NULL OR length(brand) <= 100)
  AND (category IS NULL OR length(category) <= 100)
  AND (body_type IS NULL OR length(body_type) <= 100)
  AND (message IS NULL OR length(message) <= 2000)
  AND (max_price IS NULL OR (max_price >= 0 AND max_price <= 100000000))
  AND (max_mileage IS NULL OR (max_mileage >= 0 AND max_mileage <= 10000000))
  AND is_active = true
  AND last_notified_at IS NULL
);

DROP POLICY IF EXISTS "Anyone can create inquiry_vehicles" ON public.inquiry_vehicles;
CREATE POLICY "Anyone can create inquiry_vehicles" ON public.inquiry_vehicles FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id)
  AND EXISTS (SELECT 1 FROM public.inquiries i WHERE i.id = inquiry_id AND i.created_at > now() - interval '1 hour')
);
