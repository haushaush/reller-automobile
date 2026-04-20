-- Add vehicle_category column
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_category text;

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_vehicles_category ON public.vehicles(vehicle_category);

-- Initial backfill based on existing data
UPDATE public.vehicles
SET vehicle_category = CASE
  WHEN body_type IN ('Van', 'Transporter', 'Kastenwagen', 'Pritschenwagen', 'Kleinbus', 'LKW', 'Sattelzugmaschine', 'Kipper') THEN 'commercial'
  WHEN category ILIKE '%transporter%' OR category ILIKE '%nutzfahrzeug%' THEN 'commercial'
  WHEN year IS NOT NULL 
       AND year ~ '^[0-9]{4}'
       AND CAST(SUBSTRING(year FROM 1 FOR 4) AS INTEGER) <= (EXTRACT(YEAR FROM NOW())::int - 30) 
       THEN 'oldtimer'
  WHEN year IS NOT NULL 
       AND year ~ '^[0-9]{4}'
       AND CAST(SUBSTRING(year FROM 1 FOR 4) AS INTEGER) <= (EXTRACT(YEAR FROM NOW())::int - 20) 
       THEN 'youngtimer'
  ELSE 'used'
END
WHERE vehicle_category IS NULL;