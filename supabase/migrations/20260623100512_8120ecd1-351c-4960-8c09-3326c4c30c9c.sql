ALTER TABLE public.mobile_ad_drafts ADD COLUMN IF NOT EXISTS publish_email_sent_at timestamptz;
ALTER TABLE public.mobile_ad_drafts ADD COLUMN IF NOT EXISTS publish_email_error text;