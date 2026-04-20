UPDATE vehicles
SET vehicle_category = CASE
  WHEN body_type IN ('BoxTypeDeliveryVan', 'BoxVan') THEN 'commercial'
  WHEN year ~ '^\d{4}'
       AND (EXTRACT(YEAR FROM NOW())::int - CAST(SUBSTRING(year FROM 1 FOR 4) AS INTEGER)) >= 30 THEN 'oldtimer'
  WHEN year ~ '^\d{4}'
       AND (EXTRACT(YEAR FROM NOW())::int - CAST(SUBSTRING(year FROM 1 FOR 4) AS INTEGER)) >= 20 THEN 'youngtimer'
  ELSE 'used'
END
WHERE vehicle_category IS DISTINCT FROM 'accident';