-- Timezone support for profile settings and health logs
BEGIN;

-- Create profile_settings table for per-user timezone preferences
CREATE TABLE IF NOT EXISTS public.profile_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  tz_last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profile_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their profile settings" ON public.profile_settings;

CREATE POLICY "Users manage their profile settings"
  ON public.profile_settings
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Extend health table with timezone-aware columns
ALTER TABLE public.health
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS day_key TEXT,
  ADD COLUMN IF NOT EXISTS day_start_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

ALTER TABLE public.health
  DROP CONSTRAINT IF EXISTS health_date_key;

-- Backfill existing rows with derived timezone metadata
UPDATE public.health
SET
  day_key = COALESCE(day_key, TO_CHAR(date, 'YYYY-MM-DD')),
  day_start_utc = COALESCE(
    day_start_utc,
    make_timestamptz(
      EXTRACT(YEAR FROM date)::int,
      EXTRACT(MONTH FROM date)::int,
      EXTRACT(DAY FROM date)::int,
      0,
      0,
      0,
      COALESCE(timezone, 'America/New_York')
    )
  ),
  timezone = COALESCE(timezone, 'America/New_York')
WHERE day_key IS NULL
   OR day_start_utc IS NULL
   OR timezone IS NULL;

ALTER TABLE public.health
  ALTER COLUMN day_key SET NOT NULL,
  ALTER COLUMN timezone SET NOT NULL;

-- Ensure only one entry per user + day (ignoring legacy null user rows)
CREATE UNIQUE INDEX IF NOT EXISTS health_user_day_unique
  ON public.health (user_id, day_key)
  WHERE user_id IS NOT NULL;

COMMIT;
