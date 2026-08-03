-- 1) publish status enum
DO $$ BEGIN
  CREATE TYPE public.publish_status AS ENUM ('draft','publishing','published','publish_error','unpublished','out_of_sync');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) vehicles columns
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS mobile_ad_id text,
  ADD COLUMN IF NOT EXISTS publish_status public.publish_status,
  ADD COLUMN IF NOT EXISTS publish_error text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS mobile_payload jsonb;

ALTER TABLE public.vehicles ALTER COLUMN source SET DEFAULT 'portal';

-- backfill: everything currently in vehicles came from mobile.de and is live
UPDATE public.vehicles
SET publish_status = CASE WHEN is_sold THEN 'unpublished'::public.publish_status ELSE 'published'::public.publish_status END
WHERE publish_status IS NULL;

UPDATE public.vehicles
SET mobile_ad_id = mobile_de_id
WHERE mobile_ad_id IS NULL AND source = 'mobile_de' AND mobile_de_id ~ '^[0-9]+$';

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_mobile_ad_id_uidx ON public.vehicles (mobile_ad_id) WHERE mobile_ad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vehicles_publish_status_idx ON public.vehicles (publish_status);

-- 3) carry over remaining (non-deleted) drafts as vehicle drafts
INSERT INTO public.vehicles (
  mobile_de_id, source, publish_status, title, brand, model, model_description,
  year, mileage, price, currency, power, cubic_capacity, fuel, gearbox,
  body_type, category, condition, num_seats, damage_unrepaired, exterior_color,
  description, mobile_ad_id, mobile_payload, image_urls, is_sold, synced_at
)
SELECT
  'draft_' || d.id::text,
  'portal',
  CASE WHEN d.mobile_ad_id IS NOT NULL THEN 'published'::public.publish_status ELSE 'draft'::public.publish_status END,
  COALESCE(NULLIF(trim(concat_ws(' ', d.payload->>'make', d.payload->>'model', d.payload->>'modelDescription')), ''), 'Entwurf'),
  d.payload->>'make',
  d.payload->>'model',
  d.payload->>'modelDescription',
  NULLIF(left(d.payload->>'firstRegistration', 4), ''),
  NULLIF(d.payload->>'mileage','')::int,
  NULLIF(d.payload#>>'{price,consumerPriceGross}','')::numeric::int,
  'EUR',
  NULLIF(d.payload->>'power','')::int,
  NULLIF(d.payload->>'cubicCapacity','')::int,
  d.payload->>'fuel',
  d.payload->>'gearbox',
  d.payload->>'category',
  d.payload->>'category',
  d.payload->>'condition',
  NULLIF(d.payload->>'seats','')::int,
  COALESCE((d.payload->>'damageUnrepaired')::boolean, false),
  d.payload->>'exteriorColor',
  d.payload->>'description',
  d.mobile_ad_id,
  d.payload,
  COALESCE(d.image_paths, '{}'),
  false,
  now()
FROM public.mobile_ad_drafts d
WHERE d.deleted_at IS NULL
  AND d.status <> 'deleted'
  AND NOT EXISTS (
    SELECT 1 FROM public.vehicles v WHERE v.mobile_ad_id IS NOT NULL AND v.mobile_ad_id = d.mobile_ad_id
  );

-- 4) push log
CREATE TABLE IF NOT EXISTS public.mobile_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  action text NOT NULL,
  request_body jsonb,
  response_status integer,
  response_body text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mobile_push_log TO authenticated;
GRANT ALL ON public.mobile_push_log TO service_role;
ALTER TABLE public.mobile_push_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read push log" ON public.mobile_push_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS mobile_push_log_vehicle_idx ON public.mobile_push_log (vehicle_id, created_at DESC);

-- 5) reconciliation issues
CREATE TABLE IF NOT EXISTS public.mobile_reconciliation_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  mobile_ad_id text,
  issue_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  detail text,
  scope text NOT NULL DEFAULT 'search',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, UPDATE ON public.mobile_reconciliation_issues TO authenticated;
GRANT ALL ON public.mobile_reconciliation_issues TO service_role;
ALTER TABLE public.mobile_reconciliation_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read reconciliation issues" ON public.mobile_reconciliation_issues
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update reconciliation issues" ON public.mobile_reconciliation_issues
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS mobile_reconciliation_open_idx ON public.mobile_reconciliation_issues (detected_at DESC) WHERE resolved_at IS NULL;