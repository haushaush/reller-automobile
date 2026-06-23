
CREATE TABLE public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  mail_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  recipients text[] NOT NULL DEFAULT '{}',
  subject text NULL,
  vehicle_id uuid NULL,
  mobile_ad_draft_id uuid NULL,
  mobile_ad_id text NULL,
  story_id uuid NULL,
  expose_path text NULL,
  provider text NULL,
  provider_message_id text NULL,
  provider_response jsonb NULL,
  error_message text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered_at timestamptz NULL,
  bounced_at timestamptz NULL,
  opened_at timestamptz NULL
);

GRANT SELECT ON public.email_logs TO authenticated;
GRANT ALL ON public.email_logs TO service_role;

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and editors can read email logs"
ON public.email_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

CREATE TRIGGER email_logs_set_updated_at
BEFORE UPDATE ON public.email_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX email_logs_created_at_idx ON public.email_logs (created_at DESC);
CREATE INDEX email_logs_status_idx ON public.email_logs (status);
CREATE INDEX email_logs_mail_type_idx ON public.email_logs (mail_type);
CREATE INDEX email_logs_vehicle_id_idx ON public.email_logs (vehicle_id);
CREATE INDEX email_logs_mobile_ad_draft_id_idx ON public.email_logs (mobile_ad_draft_id);
