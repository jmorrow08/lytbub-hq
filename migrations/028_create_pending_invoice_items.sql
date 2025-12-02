BEGIN;

-- Create pending invoice items to support hybrid billing queue
CREATE TABLE IF NOT EXISTS public.pending_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('usage', 'task', 'manual')),
  source_ref_id TEXT,
  description TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  amount_cents INTEGER GENERATED ALWAYS AS ((quantity * unit_price_cents)::INTEGER) STORED,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'billed', 'voided')),
  billed_invoice_id UUID REFERENCES public.invoices (id) ON DELETE SET NULL,
  billed_invoice_line_item_id UUID REFERENCES public.invoice_line_items (id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_invoice_items_created_by
  ON public.pending_invoice_items (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_invoice_items_project_status
  ON public.pending_invoice_items (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_invoice_items_client_status
  ON public.pending_invoice_items (client_id, status, created_at DESC);

ALTER TABLE public.pending_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_invoice_items_policy ON public.pending_invoice_items;
CREATE POLICY pending_invoice_items_policy
  ON public.pending_invoice_items
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Projects gain billing controls for anchor day and notification preferences
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS billing_anchor_day SMALLINT CHECK (billing_anchor_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS billing_auto_finalize BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS billing_default_collection_method TEXT DEFAULT 'charge_automatically'
    CHECK (billing_default_collection_method IN ('charge_automatically', 'send_invoice')),
  ADD COLUMN IF NOT EXISTS notify_usage_events BOOLEAN DEFAULT FALSE;

UPDATE public.projects
SET
  billing_auto_finalize = TRUE
WHERE billing_auto_finalize IS NULL;

UPDATE public.projects
SET
  billing_default_collection_method = 'charge_automatically'
WHERE billing_default_collection_method IS NULL;

UPDATE public.projects
SET
  notify_usage_events = FALSE
WHERE notify_usage_events IS NULL;

-- Link invoice line items back to pending items when billed
ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS pending_source_item_id UUID REFERENCES public.pending_invoice_items (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_pending_source
  ON public.invoice_line_items (pending_source_item_id);

COMMIT;





