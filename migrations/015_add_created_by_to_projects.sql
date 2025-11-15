BEGIN;

-- Ensure enums exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_type') THEN
    CREATE TYPE project_type AS ENUM ('content_engine', 'client', 'internal', 'experiment');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
    CREATE TYPE project_status AS ENUM ('active', 'paused', 'completed');
  END IF;
END $$;

-- Create projects table if missing (includes created_by)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  type project_type NOT NULL DEFAULT 'content_engine',
  status project_status NOT NULL DEFAULT 'active',
  color TEXT DEFAULT '#6366f1',
  default_platform TEXT,
  default_handle TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (slug = lower(slug))
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_type ON public.projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);

-- If table already existed without created_by, add it
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users (id) ON DELETE CASCADE;

-- Helpful index for ownership-scoped queries
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects (created_by, created_at DESC);

COMMIT;

