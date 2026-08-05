ALTER TABLE public.platform_accounts
  ADD COLUMN IF NOT EXISTS lead_username_secret_name text,
  ADD COLUMN IF NOT EXISTS lead_password_secret_name text,
  ADD COLUMN IF NOT EXISTS lead_api_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_cursor text;

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text UNIQUE,
  platform_account_id uuid REFERENCES public.platform_accounts(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'MOBILE',
  lead_type text NOT NULL DEFAULT 'messaging',
  status text NOT NULL DEFAULT 'IN_PROGRESS',
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  mobile_ad_id text,
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  buyer_identifier text,
  first_event_at timestamptz NOT NULL DEFAULT now(),
  last_event_at timestamptz NOT NULL DEFAULT now(),
  assigned_to uuid,
  internal_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins verwalten Anfragen" ON public.leads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_leads_last_event ON public.leads(last_event_at DESC);
CREATE INDEX idx_leads_vehicle ON public.leads(vehicle_id);
CREATE INDEX idx_leads_status ON public.leads(status);

CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_events TO authenticated;
GRANT ALL ON public.lead_events TO service_role;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins verwalten Gespraechsverlauf" ON public.lead_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_lead_events_lead ON public.lead_events(lead_id, occurred_at);

ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'missed_call';

CREATE OR REPLACE FUNCTION public.purge_old_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE removed integer;
BEGIN
  WITH del AS (
    DELETE FROM public.leads
    WHERE status IN ('NOT_INTERESTED', 'SPAM')
      AND last_event_at < now() - interval '12 months'
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM del;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_leads() TO service_role;