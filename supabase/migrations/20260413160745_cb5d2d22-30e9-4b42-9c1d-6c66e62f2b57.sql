ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS is_sold boolean NOT NULL DEFAULT false;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS sold_at timestamptz;