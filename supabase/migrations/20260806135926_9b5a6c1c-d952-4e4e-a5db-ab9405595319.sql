UPDATE public.vehicles
SET vehicle_category = 'used'
WHERE vehicle_category NOT IN ('accident','used','oldtimer','youngtimer','commercial');

DELETE FROM public.vehicles
WHERE title = 'Unbenanntes Fahrzeug'
  AND source = 'portal'
  AND publish_status = 'draft'
  AND brand IS NULL AND model IS NULL AND price IS NULL AND mileage IS NULL;

ALTER TABLE public.vehicles
ADD CONSTRAINT vehicles_vehicle_category_check
CHECK (vehicle_category IS NULL OR vehicle_category IN ('accident','used','oldtimer','youngtimer','commercial'));