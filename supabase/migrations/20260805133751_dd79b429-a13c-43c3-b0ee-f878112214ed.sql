CREATE TABLE IF NOT EXISTS public.expose_generation_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID,
  vehicle_title TEXT,
  error_message TEXT NOT NULL,
  context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.expose_generation_failures TO anon;
GRANT SELECT, INSERT ON public.expose_generation_failures TO authenticated;
GRANT ALL ON public.expose_generation_failures TO service_role;

ALTER TABLE public.expose_generation_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can report an expose failure"
ON public.expose_generation_failures FOR INSERT TO anon, authenticated
WITH CHECK (error_message IS NOT NULL AND length(error_message) <= 2000);

CREATE POLICY "Admins can read expose failures"
ON public.expose_generation_failures FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_expose_failures_created_at ON public.expose_generation_failures (created_at DESC);