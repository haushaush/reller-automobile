CREATE OR REPLACE FUNCTION public.close_issues_for_ended_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ad_id text;
  bare text;
BEGIN
  ad_id := COALESCE(OLD.external_ad_id, '');
  IF ad_id = '' THEN
    RETURN NULL;
  END IF;
  bare := regexp_replace(ad_id, '^[a-z_]+_', '');

  UPDATE public.mobile_reconciliation_issues
     SET resolved_at = now(),
         detail = COALESCE(detail, '') || ' · Geschlossen: Inserat beendet'
   WHERE resolved_at IS NULL
     AND mobile_ad_id IS NOT NULL
     AND regexp_replace(mobile_ad_id, '^[a-z_]+_', '') = bare;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_listings_close_issues_on_end ON public.listings;
CREATE TRIGGER trg_listings_close_issues_on_end
AFTER UPDATE OF status ON public.listings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('ended','not_listed','paused'))
EXECUTE FUNCTION public.close_issues_for_ended_listing();

DROP TRIGGER IF EXISTS trg_listings_close_issues_on_delete ON public.listings;
CREATE TRIGGER trg_listings_close_issues_on_delete
AFTER DELETE ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.close_issues_for_ended_listing();