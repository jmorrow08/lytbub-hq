BEGIN;

-- Add collection_method and due_date to invoices for manual payment flows
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS collection_method TEXT CHECK (collection_method IN ('charge_automatically', 'send_invoice')) DEFAULT 'charge_automatically';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices (due_date);

COMMIT;

