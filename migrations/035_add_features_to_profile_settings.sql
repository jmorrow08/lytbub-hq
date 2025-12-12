BEGIN;

-- Add per-user feature toggles stored as a JSON array on profile_settings
ALTER TABLE public.profile_settings
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '["billing"]'::jsonb;

-- Backfill any existing rows with the default feature set
UPDATE public.profile_settings
SET features = '["billing"]'::jsonb
WHERE features IS NULL;

-- Ensure future inserts always have the column populated
ALTER TABLE public.profile_settings
  ALTER COLUMN features SET DEFAULT '["billing"]'::jsonb,
  ALTER COLUMN features SET NOT NULL;

COMMIT;
