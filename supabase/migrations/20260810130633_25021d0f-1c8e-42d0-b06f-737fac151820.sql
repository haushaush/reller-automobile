-- Besucher: nur die für die Karte nötigen Spalten
REVOKE ALL ON public.sales_contacts FROM anon;
GRANT SELECT (id, slug, first_name, last_name, role, phone, mobile, photo_url, buttons, is_active, sort_order)
  ON public.sales_contacts TO anon;

-- Besucher: keinerlei Zugriff auf Terminanfragen
REVOKE ALL ON public.appointment_requests FROM anon;

-- Besucher: dürfen nur Aufrufe/Klicks zählen lassen
REVOKE ALL ON public.sales_card_events FROM anon;
GRANT INSERT ON public.sales_card_events TO anon;

-- Besucher: Weiterleitungen nur lesen
REVOKE ALL ON public.sales_contact_slug_redirects FROM anon;
GRANT SELECT ON public.sales_contact_slug_redirects TO anon;