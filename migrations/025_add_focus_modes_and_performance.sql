BEGIN;

-- Enums for focus and app modes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'focus_mode') THEN
    CREATE TYPE focus_mode AS ENUM ('CORPORATE', 'HOLISTIC');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_mode') THEN
    CREATE TYPE app_mode AS ENUM ('LYTBUB_HQ', 'FOCUS_PRO');
  END IF;
END$$;

-- Per-user app switch (stored on profile_settings; adjust to your profiles table if needed)
ALTER TABLE public.profile_settings
  ADD COLUMN IF NOT EXISTS app_mode app_mode DEFAULT 'LYTBUB_HQ';

UPDATE public.profile_settings
SET app_mode = 'LYTBUB_HQ'
WHERE app_mode IS NULL;

ALTER TABLE public.profile_settings
  ALTER COLUMN app_mode SET NOT NULL;

-- Tag tasks by focus mode
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS focus_mode focus_mode DEFAULT 'CORPORATE';

UPDATE public.tasks
SET focus_mode = 'CORPORATE'
WHERE focus_mode IS NULL;

ALTER TABLE public.tasks
  ALTER COLUMN focus_mode SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_focus_mode ON public.tasks (focus_mode);

-- Corporate performance details per task
CREATE TABLE IF NOT EXISTS public.performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  financial_impact TEXT,
  skill_demonstrated TEXT,
  kudos_received TEXT,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id)
);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_created_by ON public.performance_metrics (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_task ON public.performance_metrics (task_id);

ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS performance_metrics_policy ON public.performance_metrics;
CREATE POLICY performance_metrics_policy
  ON public.performance_metrics
  FOR ALL
  USING (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  );

-- Focus session logs
CREATE TABLE IF NOT EXISTS public.focus_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks (id) ON DELETE SET NULL,
  mode focus_mode NOT NULL DEFAULT 'HOLISTIC',
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  interruption_reason TEXT,
  ai_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_focus_logs_user_time ON public.focus_logs (user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_focus_logs_task_id ON public.focus_logs (task_id);

ALTER TABLE public.focus_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS focus_logs_policy ON public.focus_logs;
CREATE POLICY focus_logs_policy
  ON public.focus_logs
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      task_id IS NULL
      OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
    )
  );

COMMIT;
