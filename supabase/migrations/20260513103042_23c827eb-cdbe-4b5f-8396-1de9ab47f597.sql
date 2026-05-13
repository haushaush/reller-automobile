-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'viewer');

-- user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- Helper: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Helper: current_user_is_admin
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.current_user_is_admin());

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

-- vehicle_stories table
CREATE TABLE IF NOT EXISTS public.vehicle_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  story_image_url TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id),
  sent_to_dealer BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_stories_vehicle_id ON public.vehicle_stories(vehicle_id);

ALTER TABLE public.vehicle_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories are publicly readable"
  ON public.vehicle_stories FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert stories"
  ON public.vehicle_stories FOR INSERT
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Admins can update stories"
  ON public.vehicle_stories FOR UPDATE
  USING (public.current_user_is_admin());

CREATE POLICY "Admins can delete stories"
  ON public.vehicle_stories FOR DELETE
  USING (public.current_user_is_admin());

-- Storage bucket for story images
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-stories', 'vehicle-stories', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Story images publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vehicle-stories');

CREATE POLICY "Service role can write story images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vehicle-stories');