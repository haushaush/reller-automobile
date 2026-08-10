-- 1) Verkäufer-Visitenkarten
CREATE TABLE public.sales_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  role text,
  email text NOT NULL,
  phone text,
  mobile text,
  photo_url text,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  card_printed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_contacts TO authenticated;
GRANT ALL ON public.sales_contacts TO service_role;
-- Besucher dürfen ausdrücklich NICHT die E-Mail-Adresse lesen
GRANT SELECT (id, slug, first_name, last_name, role, phone, mobile, photo_url, buttons, is_active, sort_order)
  ON public.sales_contacts TO anon;

ALTER TABLE public.sales_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Karten sind öffentlich sichtbar, solange sie aktiv sind"
  ON public.sales_contacts FOR SELECT TO anon
  USING (is_active);

CREATE POLICY "Angemeldete sehen alle Karten"
  ON public.sales_contacts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Administratoren pflegen Karten"
  ON public.sales_contacts FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE TRIGGER sales_contacts_set_updated_at
  BEFORE UPDATE ON public.sales_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Weiterleitungen alter Kartenadressen
CREATE TABLE public.sales_contact_slug_redirects (
  old_slug text PRIMARY KEY,
  sales_contact_id uuid NOT NULL REFERENCES public.sales_contacts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sales_contact_slug_redirects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_contact_slug_redirects TO authenticated;
GRANT ALL ON public.sales_contact_slug_redirects TO service_role;

ALTER TABLE public.sales_contact_slug_redirects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Weiterleitungen sind öffentlich lesbar"
  ON public.sales_contact_slug_redirects FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Administratoren pflegen Weiterleitungen"
  ON public.sales_contact_slug_redirects FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

-- 3) Terminanfragen
CREATE TABLE public.appointment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_contact_id uuid REFERENCES public.sales_contacts(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  preferred_date date NOT NULL,
  preferred_time_slot text NOT NULL,
  message text,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  source_slug text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ip_hash text,
  user_agent text,
  mail_sent_at timestamptz,
  mail_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.appointment_requests TO authenticated;
GRANT ALL ON public.appointment_requests TO service_role;

ALTER TABLE public.appointment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Administratoren sehen Terminanfragen"
  ON public.appointment_requests FOR SELECT TO authenticated
  USING (public.current_user_is_admin());

CREATE POLICY "Administratoren pflegen Terminanfragen"
  ON public.appointment_requests FOR UPDATE TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Administratoren löschen Terminanfragen"
  ON public.appointment_requests FOR DELETE TO authenticated
  USING (public.current_user_is_admin());

CREATE INDEX appointment_requests_contact_idx ON public.appointment_requests (sales_contact_id, created_at DESC);

-- 4) Kartenstatistik (ohne Personenbezug)
CREATE TABLE public.sales_card_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_contact_id uuid NOT NULL REFERENCES public.sales_contacts(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view', 'click')),
  button_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.sales_card_events TO anon;
GRANT SELECT, INSERT ON public.sales_card_events TO authenticated;
GRANT ALL ON public.sales_card_events TO service_role;

ALTER TABLE public.sales_card_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Besucher dürfen Aufrufe zählen lassen"
  ON public.sales_card_events FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Angemeldete sehen die Statistik"
  ON public.sales_card_events FOR SELECT TO authenticated
  USING (true);

CREATE INDEX sales_card_events_contact_idx ON public.sales_card_events (sales_contact_id, created_at DESC);

-- 5) Startkontakte
INSERT INTO public.sales_contacts (slug, first_name, last_name, role, email, sort_order, buttons)
VALUES
  ('ralf-reller', 'Ralf', 'Reller', 'Geschäftsführer', 'ralf.reller@reller-automobile.de', 1, '[]'::jsonb),
  ('yannik-scholz', 'Yannik', 'Scholz', 'Verkauf', 'yannik.scholz@reller-automobile.de', 2, '[]'::jsonb),
  ('achim-droege', 'Achim', 'Dröge', 'Verkauf', 'achim.droege@reller-automobile.de', 3, '[]'::jsonb);