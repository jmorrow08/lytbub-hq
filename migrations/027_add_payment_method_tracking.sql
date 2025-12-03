BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method_used TEXT,
  ADD COLUMN IF NOT EXISTS payment_brand TEXT,
  ADD COLUMN IF NOT EXISTS payment_last4 TEXT;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_method_used TEXT,
  ADD COLUMN IF NOT EXISTS payment_brand TEXT,
  ADD COLUMN IF NOT EXISTS payment_last4 TEXT;

COMMIT;









