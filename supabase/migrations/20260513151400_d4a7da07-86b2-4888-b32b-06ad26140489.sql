DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'vehicle_stories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_stories;
  END IF;
END $$;
ALTER TABLE public.vehicle_stories REPLICA IDENTITY FULL;