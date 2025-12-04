-- Ensure usage_events.event_date preserves full timestamps
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usage_events'
      AND column_name = 'event_date'
      AND data_type = 'date'
  ) THEN
    ALTER TABLE public.usage_events
      ALTER COLUMN event_date TYPE timestamptz
      USING (event_date::timestamp AT TIME ZONE 'UTC');
  END IF;
END $$;
