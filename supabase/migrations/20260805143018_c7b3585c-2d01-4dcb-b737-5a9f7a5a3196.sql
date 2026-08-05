-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.digest_mode AS ENUM ('immediate', 'daily');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_event_type AS ENUM (
    'inquiry_received',
    'vehicle_sold',
    'vehicle_published',
    'publish_failed',
    'story_generated',
    'expose_created',
    'quality_report',
    'open_tasks_reminder'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ MAIL SETTINGS ============
CREATE TABLE public.mail_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sender_address text NOT NULL DEFAULT 'no-reply@reller-automobile.de',
  sender_name text NOT NULL DEFAULT 'Reller Automobile',
  reply_to_customer text NOT NULL DEFAULT 'anfrage@reller-automobile.de',
  reply_to_internal text,
  inquiry_inbox text NOT NULL DEFAULT 'anfrage@reller-automobile.de',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.mail_settings TO authenticated;
GRANT INSERT, UPDATE ON public.mail_settings TO authenticated;
GRANT ALL ON public.mail_settings TO service_role;
ALTER TABLE public.mail_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mail_settings_select_auth" ON public.mail_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mail_settings_update_admin" ON public.mail_settings
  FOR UPDATE TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE POLICY "mail_settings_insert_admin" ON public.mail_settings
  FOR INSERT TO authenticated WITH CHECK (public.current_user_is_admin());

-- Hard rule: info@ may never be a sender or reply-to address.
CREATE OR REPLACE FUNCTION public.mail_settings_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.sender_address, '')) = 'info@reller-automobile.de'
     OR lower(coalesce(NEW.reply_to_customer, '')) = 'info@reller-automobile.de'
     OR lower(coalesce(NEW.reply_to_internal, '')) = 'info@reller-automobile.de' THEN
    RAISE EXCEPTION 'info@reller-automobile.de darf nicht als Absender oder Antwortadresse verwendet werden';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER mail_settings_guard_trg
  BEFORE INSERT OR UPDATE ON public.mail_settings
  FOR EACH ROW EXECUTE FUNCTION public.mail_settings_guard();

INSERT INTO public.mail_settings (id) VALUES (1);

-- ============ BLOCKED SEND ATTEMPTS ============
CREATE TABLE public.mail_guard_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context text NOT NULL,
  offending_field text NOT NULL,
  offending_value text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mail_guard_log TO authenticated;
GRANT ALL ON public.mail_guard_log TO service_role;
ALTER TABLE public.mail_guard_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mail_guard_log_select_auth" ON public.mail_guard_log
  FOR SELECT TO authenticated USING (true);

-- ============ NOTIFICATION SETTINGS ============
CREATE TABLE public.notification_settings (
  event_type public.notification_event_type PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT true,
  digest_mode public.digest_mode NOT NULL DEFAULT 'immediate',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_settings TO authenticated;
GRANT INSERT, UPDATE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_settings_select_auth" ON public.notification_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "notification_settings_insert_admin" ON public.notification_settings
  FOR INSERT TO authenticated WITH CHECK (public.current_user_is_admin());
CREATE POLICY "notification_settings_update_admin" ON public.notification_settings
  FOR UPDATE TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

CREATE TRIGGER notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.notification_settings (event_type, digest_mode)
SELECT t, CASE WHEN t IN ('quality_report','open_tasks_reminder') THEN 'daily'::public.digest_mode ELSE 'immediate'::public.digest_mode END
FROM unnest(enum_range(NULL::public.notification_event_type)) AS t;

-- ============ NOTIFICATION RECIPIENTS ============
CREATE TABLE public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type public.notification_event_type NOT NULL,
  email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_type, email)
);

GRANT SELECT ON public.notification_recipients TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.notification_recipients TO authenticated;
GRANT ALL ON public.notification_recipients TO service_role;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_recipients_select_auth" ON public.notification_recipients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "notification_recipients_insert_admin" ON public.notification_recipients
  FOR INSERT TO authenticated WITH CHECK (public.current_user_is_admin());
CREATE POLICY "notification_recipients_update_admin" ON public.notification_recipients
  FOR UPDATE TO authenticated USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
CREATE POLICY "notification_recipients_delete_admin" ON public.notification_recipients
  FOR DELETE TO authenticated USING (public.current_user_is_admin());

INSERT INTO public.notification_recipients (event_type, email)
SELECT t, CASE WHEN t = 'inquiry_received' THEN 'anfrage@reller-automobile.de' ELSE 'info@reller-automobile.de' END
FROM unnest(enum_range(NULL::public.notification_event_type)) AS t;

-- ============ EVENT BUFFER (batching) ============
CREATE TABLE public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type public.notification_event_type NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  send_error text
);

CREATE INDEX notification_events_pending_idx
  ON public.notification_events (event_type, created_at) WHERE sent_at IS NULL;

GRANT SELECT ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_events_select_auth" ON public.notification_events
  FOR SELECT TO authenticated USING (true);

-- ============ EMAIL LOG EXTENSIONS ============
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'customer';

CREATE INDEX IF NOT EXISTS email_logs_audience_idx ON public.email_logs (audience);
CREATE INDEX IF NOT EXISTS email_logs_event_type_idx ON public.email_logs (event_type);