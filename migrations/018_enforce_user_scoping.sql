BEGIN;

-- Ensure tasks, content, and revenue rows are tied to the creating user
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.content
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.revenue
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users (id) ON DELETE CASCADE;

-- Backfill ownership information for legacy rows
DO $$
DECLARE
  fallback_user uuid;
BEGIN
  SELECT id INTO fallback_user
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  IF fallback_user IS NULL THEN
    RAISE EXCEPTION 'Cannot backfill ownership because auth.users has no rows.';
  END IF;

  -- Align tasks/content ownership with their project owner when present
  UPDATE public.tasks t
  SET created_by = p.created_by
  FROM public.projects p
  WHERE t.project_id = p.id
    AND t.created_by IS NULL;

  UPDATE public.content c
  SET created_by = p.created_by
  FROM public.projects p
  WHERE c.project_id = p.id
    AND c.created_by IS NULL;

  -- Assign any remaining legacy rows to the fallback user
  UPDATE public.tasks
  SET created_by = fallback_user
  WHERE created_by IS NULL;

  UPDATE public.content
  SET created_by = fallback_user
  WHERE created_by IS NULL;

  UPDATE public.revenue
  SET created_by = fallback_user
  WHERE created_by IS NULL;

  UPDATE public.health
  SET user_id = COALESCE(user_id, fallback_user)
  WHERE user_id IS NULL;
END $$;

ALTER TABLE public.tasks
  ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.content
  ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.revenue
  ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.health
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_created_by ON public.content (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_created_by ON public.revenue (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_user_id ON public.health (user_id, day_start_utc DESC);

-- Enable Row Level Security for user-owned tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health ENABLE ROW LEVEL SECURITY;

-- Projects policies
DROP POLICY IF EXISTS projects_select_policy ON public.projects;
DROP POLICY IF EXISTS projects_insert_policy ON public.projects;
DROP POLICY IF EXISTS projects_update_policy ON public.projects;
DROP POLICY IF EXISTS projects_delete_policy ON public.projects;

CREATE POLICY projects_select_policy
  ON public.projects
  FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY projects_insert_policy
  ON public.projects
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY projects_update_policy
  ON public.projects
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY projects_delete_policy
  ON public.projects
  FOR DELETE
  USING (auth.uid() = created_by);

-- Project channel policies restrict access based on the parent project
DROP POLICY IF EXISTS project_channels_select_policy ON public.project_channels;
DROP POLICY IF EXISTS project_channels_insert_policy ON public.project_channels;
DROP POLICY IF EXISTS project_channels_update_policy ON public.project_channels;
DROP POLICY IF EXISTS project_channels_delete_policy ON public.project_channels;

CREATE POLICY project_channels_select_policy
  ON public.project_channels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.created_by = auth.uid()
    )
  );

CREATE POLICY project_channels_insert_policy
  ON public.project_channels
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.created_by = auth.uid()
    )
  );

CREATE POLICY project_channels_update_policy
  ON public.project_channels
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.created_by = auth.uid()
    )
  );

CREATE POLICY project_channels_delete_policy
  ON public.project_channels
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.created_by = auth.uid()
    )
  );

-- Tasks policies
DROP POLICY IF EXISTS tasks_select_policy ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_policy ON public.tasks;
DROP POLICY IF EXISTS tasks_update_policy ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_policy ON public.tasks;

CREATE POLICY tasks_select_policy
  ON public.tasks
  FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY tasks_insert_policy
  ON public.tasks
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY tasks_update_policy
  ON public.tasks
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY tasks_delete_policy
  ON public.tasks
  FOR DELETE
  USING (auth.uid() = created_by);

-- Content policies
DROP POLICY IF EXISTS content_select_policy ON public.content;
DROP POLICY IF EXISTS content_insert_policy ON public.content;
DROP POLICY IF EXISTS content_update_policy ON public.content;
DROP POLICY IF EXISTS content_delete_policy ON public.content;

CREATE POLICY content_select_policy
  ON public.content
  FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY content_insert_policy
  ON public.content
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY content_update_policy
  ON public.content
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY content_delete_policy
  ON public.content
  FOR DELETE
  USING (auth.uid() = created_by);

-- Revenue policies
DROP POLICY IF EXISTS revenue_select_policy ON public.revenue;
DROP POLICY IF EXISTS revenue_insert_policy ON public.revenue;
DROP POLICY IF EXISTS revenue_update_policy ON public.revenue;
DROP POLICY IF EXISTS revenue_delete_policy ON public.revenue;

CREATE POLICY revenue_select_policy
  ON public.revenue
  FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY revenue_insert_policy
  ON public.revenue
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY revenue_update_policy
  ON public.revenue
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY revenue_delete_policy
  ON public.revenue
  FOR DELETE
  USING (auth.uid() = created_by);

-- Health policies
DROP POLICY IF EXISTS health_select_policy ON public.health;
DROP POLICY IF EXISTS health_insert_policy ON public.health;
DROP POLICY IF EXISTS health_update_policy ON public.health;
DROP POLICY IF EXISTS health_delete_policy ON public.health;

CREATE POLICY health_select_policy
  ON public.health
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY health_insert_policy
  ON public.health
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY health_update_policy
  ON public.health
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY health_delete_policy
  ON public.health
  FOR DELETE
  USING (auth.uid() = user_id);

COMMIT;
