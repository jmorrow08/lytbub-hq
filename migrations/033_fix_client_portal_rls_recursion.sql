BEGIN;

-- Helper to check if the current user is linked to a client (security definer avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_client_portal_member(target_client_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_users cu
    WHERE cu.client_id = target_client_id
      AND cu.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_client_portal_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_client_portal_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_portal_member(uuid) TO anon;

-- Fix client portal RLS policies to use the helper (avoids infinite recursion)
DROP POLICY IF EXISTS client_users_client_read ON public.client_users;
CREATE POLICY client_users_client_read
  ON public.client_users
  FOR SELECT
  USING (
    auth.uid() = user_id OR public.is_client_portal_member(client_id)
  );

DROP POLICY IF EXISTS invoices_client_portal_select ON public.invoices;
CREATE POLICY invoices_client_portal_select
  ON public.invoices
  FOR SELECT
  USING (
    public.is_client_portal_member(invoices.client_id)
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = invoices.project_id
        AND public.is_client_portal_member(p.client_id)
    )
  );

DROP POLICY IF EXISTS billing_periods_client_portal_select ON public.billing_periods;
CREATE POLICY billing_periods_client_portal_select
  ON public.billing_periods
  FOR SELECT
  USING (
    public.is_client_portal_member(billing_periods.client_id)
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = billing_periods.project_id
        AND public.is_client_portal_member(p.client_id)
    )
  );

DROP POLICY IF EXISTS usage_events_client_portal_select ON public.usage_events;
CREATE POLICY usage_events_client_portal_select
  ON public.usage_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = usage_events.project_id
        AND public.is_client_portal_member(p.client_id)
    )
  );

COMMIT;
