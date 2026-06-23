
ALTER TABLE public.mobile_ad_drafts
ADD COLUMN IF NOT EXISTS publish_email_last_attempt_at timestamptz NULL;
