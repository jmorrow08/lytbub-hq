BEGIN;

ALTER TABLE public.invoice_line_items
  DROP CONSTRAINT IF EXISTS invoice_line_items_unit_price_cents_check,
  DROP CONSTRAINT IF EXISTS invoice_line_items_amount_cents_check,
  ADD CONSTRAINT invoice_line_items_amount_not_null CHECK (amount_cents IS NOT NULL),
  ADD CONSTRAINT invoice_line_items_unit_price_not_null CHECK (unit_price_cents IS NOT NULL);

COMMIT;

