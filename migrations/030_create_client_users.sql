BEGIN;

CREATE TABLE IF NOT EXISTS public.client_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'viewer', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_users_client_user ON public.client_users (client_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_users_client_email ON public.client_users (client_id, email);
CREATE INDEX IF NOT EXISTS idx_client_users_user ON public.client_users (user_id);

ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_users_select_policy ON public.client_users;
DROP POLICY IF EXISTS client_users_modify_policy ON public.client_users;
DROP POLICY IF EXISTS client_users_admin_policy ON public.client_users;

-- Allow linked users to read their own membership row
CREATE POLICY client_users_self_select
  ON public.client_users
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow the owning workspace admin (created_by on clients) to manage memberships
CREATE POLICY client_users_admin_manage
  ON public.client_users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_id
        AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_id
        AND c.created_by = auth.uid()
    )
  );

-- Allow any client-linked user to view other members for their client (needed for portal UI)
CREATE POLICY client_users_client_read
  ON public.client_users
  FOR SELECT
  USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1
      FROM public.client_users cu
      WHERE cu.client_id = client_id
        AND cu.user_id = auth.uid()
    )
  );

COMMIT;




