-- 1) Neue Key/Label-Spalten
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS body_type_key text,
  ADD COLUMN IF NOT EXISTS body_type_label text,
  ADD COLUMN IF NOT EXISTS fuel_key text,
  ADD COLUMN IF NOT EXISTS fuel_label text,
  ADD COLUMN IF NOT EXISTS gearbox_key text,
  ADD COLUMN IF NOT EXISTS gearbox_label text,
  ADD COLUMN IF NOT EXISTS condition_key text,
  ADD COLUMN IF NOT EXISTS condition_label text,
  ADD COLUMN IF NOT EXISTS usage_type_key text,
  ADD COLUMN IF NOT EXISTS usage_type_label text,
  ADD COLUMN IF NOT EXISTS climatisation_key text,
  ADD COLUMN IF NOT EXISTS climatisation_label text,
  ADD COLUMN IF NOT EXISTS interior_type_key text,
  ADD COLUMN IF NOT EXISTS interior_type_label text,
  ADD COLUMN IF NOT EXISTS exterior_color_key text,
  ADD COLUMN IF NOT EXISTS exterior_color_label text,
  ADD COLUMN IF NOT EXISTS manual_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) sync_logs Zusatzmetriken
ALTER TABLE public.sync_logs
  ADD COLUMN IF NOT EXISTS vehicles_unchanged integer,
  ADD COLUMN IF NOT EXISTS quality_issues_found integer,
  ADD COLUMN IF NOT EXISTS price_changes integer;

-- 3) Preishistorie
CREATE TABLE IF NOT EXISTS public.vehicle_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  price integer,
  currency text NOT NULL DEFAULT 'EUR',
  recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vehicle_price_history TO authenticated;
GRANT ALL ON public.vehicle_price_history TO service_role;
ALTER TABLE public.vehicle_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read price history"
  ON public.vehicle_price_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_vph_vehicle_recorded ON public.vehicle_price_history (vehicle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_vph_recorded ON public.vehicle_price_history (recorded_at DESC);

-- 4) Datenqualitaets-Issues
CREATE TABLE IF NOT EXISTS public.vehicle_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  issue_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  detail text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT ON public.vehicle_quality_issues TO authenticated;
GRANT ALL ON public.vehicle_quality_issues TO service_role;
ALTER TABLE public.vehicle_quality_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read quality issues"
  ON public.vehicle_quality_issues FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE UNIQUE INDEX IF NOT EXISTS idx_vqi_open_unique
  ON public.vehicle_quality_issues (vehicle_id, issue_type) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vqi_open ON public.vehicle_quality_issues (issue_type, severity) WHERE resolved_at IS NULL;

-- 5) Interne, nicht-oeffentliche Fahrzeugdaten (VIN)
CREATE TABLE IF NOT EXISTS public.vehicle_private_data (
  vehicle_id uuid PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
  vin text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vehicle_private_data TO authenticated;
GRANT ALL ON public.vehicle_private_data TO service_role;
ALTER TABLE public.vehicle_private_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read private vehicle data"
  ON public.vehicle_private_data FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 6) Rueckwirkendes Mapping bestehender Zeilen
WITH m(field, key, label, prio) AS (VALUES
  ('body_type','EstateCar','Kombi',1),
  ('body_type','Cabrio','Cabrio',1),
  ('body_type','Convertible','Cabrio',2),
  ('body_type','Coupe','Coupé',1),
  ('body_type','SmallCar','Kleinwagen',1),
  ('body_type','Limousine','Limousine',1),
  ('body_type','Saloon','Limousine',2),
  ('body_type','SportsCar','Sportwagen',1),
  ('body_type','Van','Van',1),
  ('body_type','OffRoad','SUV / Geländewagen',1),
  ('body_type','OffRoader','SUV / Geländewagen',2),
  ('body_type','SUV','SUV',1),
  ('body_type','BoxTypeDeliveryVan','Kastenwagen',1),
  ('body_type','BoxVan','Kastenwagen',2),
  ('body_type','PassengerVan','Kleinbus',1),
  ('body_type','CrewCab','Doppelkabine',1),
  ('body_type','SingleCab','Einzelkabine',1),
  ('body_type','Pickup','Pickup',1),
  ('body_type','Transporter','Transporter',1),
  ('body_type','Truck','LKW',1),
  ('body_type','Tractor','Traktor',1),
  ('body_type','Trailer','Anhänger',1),
  ('body_type','SemiTrailerTruck','Sattelzugmaschine',1),
  ('body_type','Tipper','Kipper',1),
  ('body_type','OtherCar','Sonstige',1),
  ('body_type','Other','Sonstige',2),
  ('fuel','Petrol','Benzin',1),
  ('fuel','Diesel','Diesel',1),
  ('fuel','Electricity','Elektro',1),
  ('fuel','Electric','Elektro',2),
  ('fuel','Hybrid','Hybrid',1),
  ('fuel','HybridPetrol','Hybrid (Benzin)',1),
  ('fuel','HybridDiesel','Hybrid (Diesel)',1),
  ('fuel','PluginHybrid','Plug-in-Hybrid',1),
  ('fuel','PluginHybridPetrol','Plug-in-Hybrid (Benzin)',1),
  ('fuel','PluginHybridDiesel','Plug-in-Hybrid (Diesel)',1),
  ('fuel','LPG','Autogas (LPG)',1),
  ('fuel','CNG','Erdgas (CNG)',1),
  ('fuel','Hydrogen','Wasserstoff',1),
  ('fuel','Ethanol','Ethanol',1),
  ('fuel','Other','Sonstige',1),
  ('gearbox','AutomaticGear','Automatik',1),
  ('gearbox','Automatic','Automatik',2),
  ('gearbox','ManualGear','Schaltgetriebe',1),
  ('gearbox','Manual','Schaltgetriebe',2),
  ('gearbox','SemiautomaticGear','Halbautomatik',1),
  ('gearbox','SemiAutomatic','Halbautomatik',2),
  ('condition','New','Neufahrzeug',1),
  ('condition','Used','Gebrauchtfahrzeug',1),
  ('condition','Demonstration','Vorführwagen',1),
  ('condition','EmployeesCar','Mitarbeiterfahrzeug',1),
  ('condition','PreRegistration','Tageszulassung',1),
  ('condition','Accident','Unfallfahrzeug',1),
  ('condition','Damaged','Beschädigtes Fahrzeug',1),
  ('usage_type','New','Neufahrzeug',1),
  ('usage_type','Used','Gebrauchtfahrzeug',1),
  ('usage_type','Demonstration','Vorführwagen',1),
  ('usage_type','EmployeesCar','Mitarbeiterfahrzeug',1),
  ('usage_type','PreRegistration','Tageszulassung',1),
  ('usage_type','Oldtimer','Oldtimer',1),
  ('usage_type','Damaged','Beschädigtes Fahrzeug',1),
  ('usage_type','Accident','Unfallfahrzeug',1),
  ('climatisation','NoClimatisation','Keine',1),
  ('climatisation','ManualClimatisation','Klimaanlage',1),
  ('climatisation','AutomaticClimatisation','Klimaautomatik',1),
  ('climatisation','AutomaticClimatisation2Zones','2-Zonen-Klimaautomatik',1),
  ('climatisation','AutomaticClimatisation3Zones','3-Zonen-Klimaautomatik',1),
  ('climatisation','AutomaticClimatisation4Zones','4-Zonen-Klimaautomatik',1),
  ('interior_type','Cloth','Stoff',1),
  ('interior_type','PartLeather','Teilleder',1),
  ('interior_type','FullLeather','Leder',1),
  ('interior_type','Velour','Velours',1),
  ('interior_type','Alcantara','Alcantara',1),
  ('interior_type','Other','Sonstige',1),
  ('exterior_color','BLACK','Schwarz',1),
  ('exterior_color','WHITE','Weiß',1),
  ('exterior_color','SILVER','Silber',1),
  ('exterior_color','GREY','Grau',1),
  ('exterior_color','BLUE','Blau',1),
  ('exterior_color','RED','Rot',1),
  ('exterior_color','GREEN','Grün',1),
  ('exterior_color','YELLOW','Gelb',1),
  ('exterior_color','ORANGE','Orange',1),
  ('exterior_color','BROWN','Braun',1),
  ('exterior_color','BEIGE','Beige',1),
  ('exterior_color','GOLD','Gold',1),
  ('exterior_color','PURPLE','Violett',1),
  ('exterior_color','BRONZE','Bronze',1)
),
by_key AS (
  SELECT field, key, label FROM m
),
by_label AS (
  SELECT DISTINCT ON (field, lower(label)) field, lower(label) AS l, key, label
  FROM m ORDER BY field, lower(label), prio
)
UPDATE public.vehicles v SET
  body_type_key = COALESCE(bk.key, bl.key),
  body_type_label = COALESCE(bk.label, bl.label, v.body_type),
  fuel_key = COALESCE(fk.key, fl.key),
  fuel_label = COALESCE(fk.label, fl.label, v.fuel),
  gearbox_key = COALESCE(gk.key, gl.key),
  gearbox_label = COALESCE(gk.label, gl.label, v.gearbox),
  condition_key = COALESCE(ck.key, cl.key),
  condition_label = COALESCE(ck.label, cl.label, v.condition),
  usage_type_key = COALESCE(uk.key, ul.key),
  usage_type_label = COALESCE(uk.label, ul.label, v.usage_type),
  climatisation_key = COALESCE(mk.key, ml.key),
  climatisation_label = COALESCE(mk.label, ml.label, v.climatisation),
  interior_type_key = COALESCE(ik.key, il.key),
  interior_type_label = COALESCE(ik.label, il.label, v.interior_type),
  exterior_color_key = COALESCE(ek.key, el.key),
  exterior_color_label = COALESCE(ek.label, el.label, v.exterior_color)
FROM (SELECT 1) AS dummy
LEFT JOIN by_key bk ON bk.field='body_type' AND FALSE
LEFT JOIN by_key fk ON FALSE
LEFT JOIN by_key gk ON FALSE
LEFT JOIN by_key ck ON FALSE
LEFT JOIN by_key uk ON FALSE
LEFT JOIN by_key mk ON FALSE
LEFT JOIN by_key ik ON FALSE
LEFT JOIN by_key ek ON FALSE
LEFT JOIN by_label bl ON FALSE
LEFT JOIN by_label fl ON FALSE
LEFT JOIN by_label gl ON FALSE
LEFT JOIN by_label cl ON FALSE
LEFT JOIN by_label ul ON FALSE
LEFT JOIN by_label ml ON FALSE
LEFT JOIN by_label il ON FALSE
LEFT JOIN by_label el ON FALSE
WHERE FALSE;

-- Mapping-Helferfunktionen (stabil, wiederverwendbar)
CREATE TABLE IF NOT EXISTS public.mobile_de_label_map (
  field text NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  prio integer NOT NULL DEFAULT 1,
  PRIMARY KEY (field, key)
);
GRANT SELECT ON public.mobile_de_label_map TO anon, authenticated;
GRANT ALL ON public.mobile_de_label_map TO service_role;
ALTER TABLE public.mobile_de_label_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Label map is publicly readable"
  ON public.mobile_de_label_map FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.mobile_de_label_map(field, key, label, prio) VALUES
  ('body_type','EstateCar','Kombi',1),
  ('body_type','Cabrio','Cabrio',1),
  ('body_type','Convertible','Cabrio',2),
  ('body_type','Coupe','Coupé',1),
  ('body_type','SmallCar','Kleinwagen',1),
  ('body_type','Limousine','Limousine',1),
  ('body_type','Saloon','Limousine',2),
  ('body_type','SportsCar','Sportwagen',1),
  ('body_type','Van','Van',1),
  ('body_type','OffRoad','SUV / Geländewagen',1),
  ('body_type','OffRoader','SUV / Geländewagen',2),
  ('body_type','SUV','SUV',1),
  ('body_type','BoxTypeDeliveryVan','Kastenwagen',1),
  ('body_type','BoxVan','Kastenwagen',2),
  ('body_type','PassengerVan','Kleinbus',1),
  ('body_type','CrewCab','Doppelkabine',1),
  ('body_type','SingleCab','Einzelkabine',1),
  ('body_type','Pickup','Pickup',1),
  ('body_type','Transporter','Transporter',1),
  ('body_type','Truck','LKW',1),
  ('body_type','Tractor','Traktor',1),
  ('body_type','Trailer','Anhänger',1),
  ('body_type','SemiTrailerTruck','Sattelzugmaschine',1),
  ('body_type','Tipper','Kipper',1),
  ('body_type','OtherCar','Sonstige',1),
  ('body_type','Other','Sonstige',2),
  ('fuel','Petrol','Benzin',1),
  ('fuel','Diesel','Diesel',1),
  ('fuel','Electricity','Elektro',1),
  ('fuel','Electric','Elektro',2),
  ('fuel','Hybrid','Hybrid',1),
  ('fuel','HybridPetrol','Hybrid (Benzin)',1),
  ('fuel','HybridDiesel','Hybrid (Diesel)',1),
  ('fuel','PluginHybrid','Plug-in-Hybrid',1),
  ('fuel','PluginHybridPetrol','Plug-in-Hybrid (Benzin)',1),
  ('fuel','PluginHybridDiesel','Plug-in-Hybrid (Diesel)',1),
  ('fuel','LPG','Autogas (LPG)',1),
  ('fuel','CNG','Erdgas (CNG)',1),
  ('fuel','Hydrogen','Wasserstoff',1),
  ('fuel','Ethanol','Ethanol',1),
  ('fuel','Other','Sonstige',1),
  ('gearbox','AutomaticGear','Automatik',1),
  ('gearbox','Automatic','Automatik',2),
  ('gearbox','ManualGear','Schaltgetriebe',1),
  ('gearbox','Manual','Schaltgetriebe',2),
  ('gearbox','SemiautomaticGear','Halbautomatik',1),
  ('gearbox','SemiAutomatic','Halbautomatik',2),
  ('condition','New','Neufahrzeug',1),
  ('condition','Used','Gebrauchtfahrzeug',1),
  ('condition','Demonstration','Vorführwagen',1),
  ('condition','EmployeesCar','Mitarbeiterfahrzeug',1),
  ('condition','PreRegistration','Tageszulassung',1),
  ('condition','Accident','Unfallfahrzeug',1),
  ('condition','Damaged','Beschädigtes Fahrzeug',1),
  ('usage_type','New','Neufahrzeug',1),
  ('usage_type','Used','Gebrauchtfahrzeug',1),
  ('usage_type','Demonstration','Vorführwagen',1),
  ('usage_type','EmployeesCar','Mitarbeiterfahrzeug',1),
  ('usage_type','PreRegistration','Tageszulassung',1),
  ('usage_type','Oldtimer','Oldtimer',1),
  ('usage_type','Damaged','Beschädigtes Fahrzeug',1),
  ('usage_type','Accident','Unfallfahrzeug',1),
  ('climatisation','NoClimatisation','Keine',1),
  ('climatisation','ManualClimatisation','Klimaanlage',1),
  ('climatisation','AutomaticClimatisation','Klimaautomatik',1),
  ('climatisation','AutomaticClimatisation2Zones','2-Zonen-Klimaautomatik',1),
  ('climatisation','AutomaticClimatisation3Zones','3-Zonen-Klimaautomatik',1),
  ('climatisation','AutomaticClimatisation4Zones','4-Zonen-Klimaautomatik',1),
  ('interior_type','Cloth','Stoff',1),
  ('interior_type','PartLeather','Teilleder',1),
  ('interior_type','FullLeather','Leder',1),
  ('interior_type','Velour','Velours',1),
  ('interior_type','Alcantara','Alcantara',1),
  ('interior_type','Other','Sonstige',1),
  ('exterior_color','BLACK','Schwarz',1),
  ('exterior_color','WHITE','Weiß',1),
  ('exterior_color','SILVER','Silber',1),
  ('exterior_color','GREY','Grau',1),
  ('exterior_color','BLUE','Blau',1),
  ('exterior_color','RED','Rot',1),
  ('exterior_color','GREEN','Grün',1),
  ('exterior_color','YELLOW','Gelb',1),
  ('exterior_color','ORANGE','Orange',1),
  ('exterior_color','BROWN','Braun',1),
  ('exterior_color','BEIGE','Beige',1),
  ('exterior_color','GOLD','Gold',1),
  ('exterior_color','PURPLE','Violett',1),
  ('exterior_color','BRONZE','Bronze',1)
ON CONFLICT (field, key) DO UPDATE SET label = EXCLUDED.label, prio = EXCLUDED.prio;

CREATE OR REPLACE FUNCTION public.mobile_de_resolve_key(_field text, _value text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT key FROM public.mobile_de_label_map WHERE field = _field AND lower(key) = lower(_value) ORDER BY prio LIMIT 1),
    (SELECT key FROM public.mobile_de_label_map WHERE field = _field AND lower(label) = lower(_value) ORDER BY prio LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION public.mobile_de_resolve_label(_field text, _value text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT label FROM public.mobile_de_label_map WHERE field = _field AND lower(key) = lower(_value) ORDER BY prio LIMIT 1),
    (SELECT label FROM public.mobile_de_label_map WHERE field = _field AND lower(label) = lower(_value) ORDER BY prio LIMIT 1),
    _value
  )
$$;

-- Backfill mit den Helferfunktionen
UPDATE public.vehicles SET
  body_type_key       = public.mobile_de_resolve_key('body_type', body_type),
  body_type_label     = public.mobile_de_resolve_label('body_type', body_type),
  fuel_key            = public.mobile_de_resolve_key('fuel', fuel),
  fuel_label          = public.mobile_de_resolve_label('fuel', fuel),
  gearbox_key         = public.mobile_de_resolve_key('gearbox', gearbox),
  gearbox_label       = public.mobile_de_resolve_label('gearbox', gearbox),
  condition_key       = public.mobile_de_resolve_key('condition', condition),
  condition_label     = public.mobile_de_resolve_label('condition', condition),
  usage_type_key      = public.mobile_de_resolve_key('usage_type', usage_type),
  usage_type_label    = public.mobile_de_resolve_label('usage_type', usage_type),
  climatisation_key   = public.mobile_de_resolve_key('climatisation', climatisation),
  climatisation_label = public.mobile_de_resolve_label('climatisation', climatisation),
  interior_type_key   = public.mobile_de_resolve_key('interior_type', interior_type),
  interior_type_label = public.mobile_de_resolve_label('interior_type', interior_type),
  exterior_color_key  = public.mobile_de_resolve_key('exterior_color', exterior_color),
  exterior_color_label= public.mobile_de_resolve_label('exterior_color', exterior_color);

-- Bestehende VIN-Werte in die geschuetzte Tabelle uebernehmen und aus vehicles entfernen
INSERT INTO public.vehicle_private_data (vehicle_id, vin)
SELECT id, vin FROM public.vehicles WHERE vin IS NOT NULL AND vin <> ''
ON CONFLICT (vehicle_id) DO UPDATE SET vin = EXCLUDED.vin, updated_at = now();

ALTER TABLE public.vehicles DROP COLUMN IF EXISTS vin;

-- Startzeilen fuer die Preishistorie
INSERT INTO public.vehicle_price_history (vehicle_id, price, currency, recorded_at)
SELECT id, price, COALESCE(currency, 'EUR'), COALESCE(created_at, now())
FROM public.vehicles WHERE price IS NOT NULL;