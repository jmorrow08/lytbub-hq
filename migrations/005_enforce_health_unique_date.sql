-- Ensure there is exactly one row per calendar date in public.health
BEGIN;

-- Drop a possible user-scoped unique constraint if it exists
ALTER TABLE public.health
  DROP CONSTRAINT IF EXISTS health_user_id_date_key;

-- Drop any prior unique constraint on date with a different name
ALTER TABLE public.health
  DROP CONSTRAINT IF EXISTS health_date_key;

-- Add the canonical unique(date) constraint expected by the application
ALTER TABLE public.health
  ADD CONSTRAINT health_date_key UNIQUE (date);

COMMIT;


