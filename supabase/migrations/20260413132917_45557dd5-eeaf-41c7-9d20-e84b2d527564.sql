
-- Create vehicles table for Mobile.de sync
CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mobile_de_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  model TEXT,
  body_type TEXT,
  year TEXT,
  mileage INTEGER,
  price INTEGER,
  currency TEXT DEFAULT 'EUR',
  image_urls TEXT[] DEFAULT '{}',
  description TEXT,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Public read access (vehicles are public listings)
CREATE POLICY "Vehicles are publicly readable"
ON public.vehicles
FOR SELECT
TO anon, authenticated
USING (true);

-- Only service role can insert/update/delete (via edge function)
-- No insert/update/delete policies for anon/authenticated = denied by default

-- Index for common filters
CREATE INDEX idx_vehicles_brand ON public.vehicles(brand);
CREATE INDEX idx_vehicles_category ON public.vehicles(category);
CREATE INDEX idx_vehicles_body_type ON public.vehicles(body_type);
CREATE INDEX idx_vehicles_year ON public.vehicles(year);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_vehicles_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
