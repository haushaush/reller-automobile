ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS vehicles_is_test_idx ON public.vehicles (is_test) WHERE is_test;

DROP POLICY IF EXISTS "Vehicles are publicly readable" ON public.vehicles;
CREATE POLICY "Vehicles are publicly readable"
  ON public.vehicles FOR SELECT TO anon
  USING (is_test = false);
CREATE POLICY "Staff can read all vehicles"
  ON public.vehicles FOR SELECT TO authenticated
  USING (true);

-- Verkaufsmeldung für Testfahrzeuge unterdrücken
CREATE OR REPLACE FUNCTION public.notify_vehicle_sold()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  enabled boolean;
  listing_info jsonb;
BEGIN
  IF NEW.is_test IS TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.is_sold IS NOT TRUE OR OLD.is_sold IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT is_enabled INTO enabled FROM public.notification_settings WHERE event_type = 'vehicle_sold';
  IF enabled IS FALSE THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('platform', l.platform, 'status', l.status)), '[]'::jsonb)
    INTO listing_info
  FROM public.listings l
  WHERE l.vehicle_id = NEW.id AND l.status IN ('live', 'draft', 'publishing', 'paused');

  INSERT INTO public.notification_events (event_type, payload)
  VALUES ('vehicle_sold', jsonb_build_object(
    'vehicleId', NEW.id,
    'title', NEW.title,
    'price', NEW.price,
    'currency', COALESCE(NEW.currency, 'EUR'),
    'standtage', GREATEST(0, EXTRACT(DAY FROM (now() - COALESCE(NEW.creation_date, NEW.created_at)))::int),
    'listings', listing_info
  ));

  RETURN NEW;
END;
$function$;

-- Meldungen und Aufgaben für Testfahrzeuge blockieren
CREATE OR REPLACE FUNCTION public.block_rows_for_test_vehicles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.vehicle_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = NEW.vehicle_id AND v.is_test) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_test_quality_issues ON public.vehicle_quality_issues;
CREATE TRIGGER trg_block_test_quality_issues
  BEFORE INSERT ON public.vehicle_quality_issues
  FOR EACH ROW EXECUTE FUNCTION public.block_rows_for_test_vehicles();

DROP TRIGGER IF EXISTS trg_block_test_reconcile_issues ON public.mobile_reconciliation_issues;
CREATE TRIGGER trg_block_test_reconcile_issues
  BEFORE INSERT ON public.mobile_reconciliation_issues
  FOR EACH ROW EXECUTE FUNCTION public.block_rows_for_test_vehicles();

DROP TRIGGER IF EXISTS trg_block_test_listing_tasks ON public.listing_tasks;
CREATE TRIGGER trg_block_test_listing_tasks
  BEFORE INSERT ON public.listing_tasks
  FOR EACH ROW EXECUTE FUNCTION public.block_rows_for_test_vehicles();

-- Benachrichtigungsereignisse für Testfahrzeuge blockieren
CREATE OR REPLACE FUNCTION public.block_events_for_test_vehicles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  vid uuid;
BEGIN
  BEGIN
    vid := (NEW.payload ->> 'vehicleId')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  IF vid IS NOT NULL AND EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vid AND v.is_test) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_test_notification_events ON public.notification_events;
CREATE TRIGGER trg_block_test_notification_events
  BEFORE INSERT ON public.notification_events
  FOR EACH ROW EXECUTE FUNCTION public.block_events_for_test_vehicles();