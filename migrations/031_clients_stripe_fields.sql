BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS client_portal_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS client_portal_last_access TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_portal_notes TEXT;

-- Ensure stripe_customer_id is unique per client when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_stripe_customer
  ON public.clients (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Backfill stripe customer on clients from existing projects
WITH project_customers AS (
  SELECT DISTINCT ON (p.client_id)
    p.client_id,
    p.stripe_customer_id
  FROM public.projects p
  WHERE p.stripe_customer_id IS NOT NULL
  ORDER BY p.client_id, p.updated_at DESC NULLS LAST
)
UPDATE public.clients c
SET stripe_customer_id = pc.stripe_customer_id
FROM project_customers pc
WHERE c.id = pc.client_id
  AND c.stripe_customer_id IS NULL;

COMMIT;




