ALTER TABLE public.platform_accounts
  ADD COLUMN IF NOT EXISTS short_label text,
  ADD COLUMN IF NOT EXISTS badge_color text;

UPDATE public.platform_accounts SET short_label = 'Hauptkonto', badge_color = 'slate'
  WHERE platform = 'mobile_de' AND account_key = 'standard' AND short_label IS NULL;

UPDATE public.platform_accounts SET short_label = 'Unfallkonto', badge_color = 'amber'
  WHERE platform = 'mobile_de' AND account_key IN ('unfall','accident') AND short_label IS NULL;

UPDATE public.platform_accounts SET short_label = label
  WHERE short_label IS NULL;

UPDATE public.platform_accounts SET badge_color = 'slate'
  WHERE badge_color IS NULL;