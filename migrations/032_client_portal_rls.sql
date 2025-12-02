BEGIN;

-- Allow client portal users to read invoices tied to their client
DROP POLICY IF EXISTS invoices_client_portal_select ON public.invoices;
CREATE POLICY invoices_client_portal_select
  ON public.invoices
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_users cu
      WHERE cu.user_id = auth.uid()
        AND (
          (invoices.client_id IS NOT NULL AND invoices.client_id = cu.client_id)
          OR EXISTS (
            SELECT 1
            FROM public.projects p
            WHERE p.id = invoices.project_id
              AND p.client_id = cu.client_id
          )
        )
    )
  );

-- Allow client portal users to read billing periods for their client
DROP POLICY IF EXISTS billing_periods_client_portal_select ON public.billing_periods;
CREATE POLICY billing_periods_client_portal_select
  ON public.billing_periods
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_users cu
      WHERE cu.user_id = auth.uid()
        AND (
          (billing_periods.client_id IS NOT NULL AND billing_periods.client_id = cu.client_id)
          OR EXISTS (
            SELECT 1
            FROM public.projects p
            WHERE p.id = billing_periods.project_id
              AND p.client_id = cu.client_id
          )
        )
    )
  );

-- Allow client portal users to read usage events tied to their client's projects
DROP POLICY IF EXISTS usage_events_client_portal_select ON public.usage_events;
CREATE POLICY usage_events_client_portal_select
  ON public.usage_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_users cu
      JOIN public.projects p ON p.id = usage_events.project_id
      WHERE cu.user_id = auth.uid()
        AND p.client_id = cu.client_id
    )
  );

COMMIT;

