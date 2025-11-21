BEGIN;

-- Add client linkage to finance tables
ALTER TABLE public.billing_periods
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL;

-- Backfill finance rows from their associated client projects
UPDATE public.billing_periods bp
SET client_id = p.client_id
FROM public.projects p
WHERE bp.project_id = p.id
  AND bp.client_id IS NULL
  AND p.client_id IS NOT NULL;

UPDATE public.invoices i
SET client_id = p.client_id
FROM public.projects p
WHERE i.project_id = p.id
  AND i.client_id IS NULL
  AND p.client_id IS NOT NULL;

UPDATE public.payments pay
SET client_id = p.client_id
FROM public.projects p
WHERE pay.project_id = p.id
  AND pay.client_id IS NULL
  AND p.client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_periods_client ON public.billing_periods (client_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_client ON public.payments (client_id, created_at DESC);

COMMIT;
