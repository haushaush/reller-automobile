-- Inquiries (customer requests)
CREATE TABLE public.inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salutation TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  preferred_contact TEXT CHECK (preferred_contact IN ('email', 'phone', 'both')),
  gdpr_accepted BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Junction with vehicle snapshot for historical accuracy
CREATE TABLE public.inquiry_vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id),
  vehicle_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_inquiries_status ON public.inquiries(status);
CREATE INDEX idx_inquiries_created_at ON public.inquiries(created_at DESC);
CREATE INDEX idx_inquiries_ip_created ON public.inquiries(ip_address, created_at DESC);
CREATE INDEX idx_inquiry_vehicles_inquiry_id ON public.inquiry_vehicles(inquiry_id);

-- RLS: anon may INSERT, no SELECT/UPDATE/DELETE for clients
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create inquiries"
ON public.inquiries FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Anyone can create inquiry_vehicles"
ON public.inquiry_vehicles FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- updated_at trigger using existing helper
CREATE TRIGGER trg_inquiries_updated_at
BEFORE UPDATE ON public.inquiries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();