BEGIN;

-- Add client relationship to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL;

-- Backfill: create a client record for each existing client-type project
INSERT INTO public.clients (id, name, company_name, contact_name, email, phone, notes, created_by, created_at, updated_at)
SELECT
  p.id AS id,
  p.name,
  p.name AS company_name,
  NULL AS contact_name,
  NULL AS email,
  NULL AS phone,
  p.notes AS notes,
  p.created_by,
  p.created_at,
  p.updated_at
FROM public.projects p
LEFT JOIN public.clients c ON c.id = p.id
WHERE p.type = 'client'
  AND p.client_id IS NULL
  AND c.id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE public.projects
SET client_id = id
WHERE type = 'client'
  AND client_id IS NULL
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = projects.id);

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects (client_id);

COMMIT;
