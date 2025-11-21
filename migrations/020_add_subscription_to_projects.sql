BEGIN;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS subscription_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS base_retainer_cents INTEGER CHECK (base_retainer_cents IS NULL OR base_retainer_cents >= 0),
  ADD COLUMN IF NOT EXISTS auto_pay_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_type TEXT NOT NULL DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS ach_discount_cents INTEGER NOT NULL DEFAULT 500 CHECK (ach_discount_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_projects_subscription_enabled ON public.projects (subscription_enabled)
  WHERE subscription_enabled = TRUE;

COMMIT;

