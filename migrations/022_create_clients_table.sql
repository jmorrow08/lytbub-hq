BEGIN;

-- Clients table with basic contact details
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_created_by ON public.clients (created_by, created_at DESC);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clients_select_policy ON public.clients;
DROP POLICY IF EXISTS clients_insert_policy ON public.clients;
DROP POLICY IF EXISTS clients_update_policy ON public.clients;
DROP POLICY IF EXISTS clients_delete_policy ON public.clients;

CREATE POLICY clients_select_policy
  ON public.clients
  FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY clients_insert_policy
  ON public.clients
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY clients_update_policy
  ON public.clients
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY clients_delete_policy
  ON public.clients
  FOR DELETE
  USING (auth.uid() = created_by);

COMMIT;
