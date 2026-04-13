
-- price_history table
CREATE TABLE public.price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  price INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_history_vehicle_id ON public.price_history(vehicle_id);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Price history is publicly readable"
  ON public.price_history FOR SELECT
  TO anon, authenticated
  USING (true);

-- vehicle_alerts table
CREATE TABLE public.vehicle_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  brand TEXT,
  category TEXT,
  body_type TEXT,
  max_price INTEGER,
  min_year TEXT,
  max_mileage INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_notified_at TIMESTAMPTZ
);

ALTER TABLE public.vehicle_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create alerts"
  ON public.vehicle_alerts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
