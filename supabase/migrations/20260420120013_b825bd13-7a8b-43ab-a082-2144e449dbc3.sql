-- Decode HTML entities (incl. double-encoded) in existing vehicle text fields.
-- Loop up to 5 iterations to handle &amp;amp; -> &amp; -> &.
DO $$
DECLARE
  iteration INTEGER := 0;
  max_iterations INTEGER := 5;
  affected INTEGER;
BEGIN
  WHILE iteration < max_iterations LOOP
    UPDATE vehicles
    SET
      title = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(title,
        '&amp;', '&'),
        '&lt;', '<'),
        '&gt;', '>'),
        '&quot;', '"'),
        '&apos;', ''''),
        '&nbsp;', ' '),
      model_description = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(model_description, ''),
        '&amp;', '&'),
        '&lt;', '<'),
        '&gt;', '>'),
        '&quot;', '"'),
        '&apos;', ''''),
        '&nbsp;', ' '),
      description = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(description, ''),
        '&amp;', '&'),
        '&lt;', '<'),
        '&gt;', '>'),
        '&quot;', '"'),
        '&apos;', ''''),
        '&nbsp;', ' '),
      brand = REPLACE(REPLACE(COALESCE(brand, ''), '&amp;', '&'), '&apos;', ''''),
      model = REPLACE(REPLACE(COALESCE(model, ''), '&amp;', '&'), '&apos;', ''''),
      body_type = REPLACE(COALESCE(body_type, ''), '&amp;', '&'),
      fuel = REPLACE(COALESCE(fuel, ''), '&amp;', '&'),
      gearbox = REPLACE(COALESCE(gearbox, ''), '&amp;', '&'),
      climatisation = REPLACE(COALESCE(climatisation, ''), '&amp;', '&'),
      condition = REPLACE(COALESCE(condition, ''), '&amp;', '&'),
      usage_type = REPLACE(COALESCE(usage_type, ''), '&amp;', '&'),
      exterior_color = REPLACE(COALESCE(exterior_color, ''), '&amp;', '&'),
      interior_color = REPLACE(COALESCE(interior_color, ''), '&amp;', '&'),
      interior_type = REPLACE(COALESCE(interior_type, ''), '&amp;', '&'),
      seller_city = REPLACE(COALESCE(seller_city, ''), '&amp;', '&')
    WHERE
      title LIKE '%&%;%' OR
      model_description LIKE '%&%;%' OR
      description LIKE '%&%;%' OR
      brand LIKE '%&%;%' OR
      model LIKE '%&%;%' OR
      body_type LIKE '%&%;%' OR
      fuel LIKE '%&%;%' OR
      gearbox LIKE '%&%;%' OR
      climatisation LIKE '%&%;%' OR
      condition LIKE '%&%;%' OR
      usage_type LIKE '%&%;%' OR
      exterior_color LIKE '%&%;%' OR
      interior_color LIKE '%&%;%' OR
      interior_type LIKE '%&%;%' OR
      seller_city LIKE '%&%;%';

    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected = 0;
    iteration := iteration + 1;
  END LOOP;
END $$;