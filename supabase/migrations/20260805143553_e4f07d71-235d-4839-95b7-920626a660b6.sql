CREATE OR REPLACE FUNCTION public.notify_vehicle_sold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enabled boolean;
  listing_info jsonb;
BEGIN
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
$$;

DROP TRIGGER IF EXISTS trg_notify_vehicle_sold ON public.vehicles;
CREATE TRIGGER trg_notify_vehicle_sold
AFTER UPDATE OF is_sold ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.notify_vehicle_sold();