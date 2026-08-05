-- ── Enums ─────────────────────────────────────────────────────────────
CREATE TYPE public.listing_platform AS ENUM ('mobile_de', 'autoscout24', 'kleinanzeigen');
CREATE TYPE public.listing_status AS ENUM ('not_listed', 'draft', 'publishing', 'live', 'error', 'paused', 'ended');
CREATE TYPE public.listing_task_action AS ENUM ('end_listing', 'update_price', 'mark_reserved', 'reactivate');

-- ── platform_accounts ────────────────────────────────────────────────
CREATE TABLE public.platform_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform public.listing_platform NOT NULL,
  account_key text NOT NULL,
  label text NOT NULL,
  seller_id text,
  username_secret_name text,
  password_secret_name text,
  is_active boolean NOT NULL DEFAULT true,
  default_for_categories text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_accounts_platform_key_unique UNIQUE (platform, account_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_accounts TO authenticated;
GRANT ALL ON public.platform_accounts TO service_role;
ALTER TABLE public.platform_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage platform accounts"
  ON public.platform_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER platform_accounts_set_updated_at
  BEFORE UPDATE ON public.platform_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_accounts
  (platform, account_key, label, seller_id, username_secret_name, password_secret_name, default_for_categories, sort_order)
VALUES
  ('mobile_de', 'standard', 'Reller Gebrauchtwagen', '451040',
   'MOBILE_DE_USERNAME', 'MOBILE_DE_PASSWORD',
   ARRAY['used','new','oldtimer','youngtimer','commercial'], 1),
  ('mobile_de', 'unfall', 'Reller Unfallfahrzeuge', '451040',
   'MOBILE_DE_ACCIDENT_USERNAME', 'MOBILE_DE_ACCIDENT_PASSWORD',
   ARRAY['accident'], 2);

-- ── listings ─────────────────────────────────────────────────────────
CREATE TABLE public.listings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  platform public.listing_platform NOT NULL,
  account_key text,
  external_ad_id text,
  external_url text,
  status public.listing_status NOT NULL DEFAULT 'not_listed',
  is_manual boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  last_pushed_at timestamptz,
  last_checked_at timestamptz,
  error_message text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX listings_vehicle_platform_account_uidx
  ON public.listings (vehicle_id, platform, COALESCE(account_key, ''));
CREATE INDEX listings_vehicle_idx ON public.listings (vehicle_id);
CREATE INDEX listings_status_idx ON public.listings (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage listings"
  ON public.listings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER listings_set_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── listing_tasks ────────────────────────────────────────────────────
CREATE TABLE public.listing_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  action public.listing_task_action NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  done_by uuid,
  dismissed_at timestamptz
);

CREATE INDEX listing_tasks_open_idx ON public.listing_tasks (created_at DESC)
  WHERE done_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX listing_tasks_vehicle_idx ON public.listing_tasks (vehicle_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_tasks TO authenticated;
GRANT ALL ON public.listing_tasks TO service_role;
ALTER TABLE public.listing_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage listing tasks"
  ON public.listing_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── Datenübernahme aus vehicles ──────────────────────────────────────
INSERT INTO public.listings
  (vehicle_id, platform, account_key, external_ad_id, external_url, status,
   is_manual, published_at, last_pushed_at)
SELECT
  v.id,
  'mobile_de'::public.listing_platform,
  CASE WHEN v.vehicle_category = 'accident' THEN 'unfall' ELSE 'standard' END,
  v.mobile_ad_id,
  v.detail_page_url,
  CASE v.publish_status::text
    WHEN 'draft' THEN 'draft'
    WHEN 'publishing' THEN 'publishing'
    WHEN 'published' THEN 'live'
    WHEN 'publish_error' THEN 'error'
    WHEN 'unpublished' THEN 'ended'
    WHEN 'out_of_sync' THEN 'live'
    ELSE CASE WHEN v.mobile_ad_id IS NOT NULL OR v.mobile_de_id IS NOT NULL THEN 'live' ELSE 'not_listed' END
  END::public.listing_status,
  false,
  v.published_at,
  v.last_pushed_at
FROM public.vehicles v
WHERE v.is_sold = false;

-- ── View ─────────────────────────────────────────────────────────────
CREATE VIEW public.vehicle_listing_overview
WITH (security_invoker = true) AS
SELECT
  l.vehicle_id,
  jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'platform', l.platform,
      'account_key', l.account_key,
      'status', l.status,
      'is_manual', l.is_manual,
      'external_ad_id', l.external_ad_id,
      'external_url', l.external_url,
      'note', l.note,
      'error_message', l.error_message,
      'updated_at', l.updated_at
    ) ORDER BY l.platform, l.account_key
  ) AS listings,
  count(*) FILTER (WHERE l.status = 'live') AS live_count,
  count(*) FILTER (WHERE l.status = 'error') AS error_count
FROM public.listings l
GROUP BY l.vehicle_id;

GRANT SELECT ON public.vehicle_listing_overview TO authenticated;
GRANT SELECT ON public.vehicle_listing_overview TO service_role;