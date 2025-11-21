BEGIN;

-- Enums for billing workflows (created once if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_period_status') THEN
    CREATE TYPE billing_period_status AS ENUM ('draft', 'finalized', 'paid');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE invoice_status AS ENUM ('draft', 'open', 'paid', 'void');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_line_type') THEN
    CREATE TYPE invoice_line_type AS ENUM ('base_subscription', 'usage', 'project', 'processing_fee');
  END IF;
END
$$;

-- Billing periods represent a client's monthly cycle
CREATE TABLE IF NOT EXISTS public.billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status billing_period_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_periods_valid_range CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_billing_periods_project ON public.billing_periods (project_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_billing_periods_created_by ON public.billing_periods (created_by, created_at DESC);

-- Usage events are imported from CSV or future APIs
CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  billing_period_id UUID REFERENCES public.billing_periods (id) ON DELETE SET NULL,
  event_date DATE NOT NULL,
  metric_type TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity >= 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  description TEXT,
  metadata JSONB,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_project_date ON public.usage_events (project_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_billing_period ON public.usage_events (billing_period_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_by ON public.usage_events (created_by, created_at DESC);

-- Invoices track Stripe invoice metadata
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT,
  project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  billing_period_id UUID REFERENCES public.billing_periods (id) ON DELETE SET NULL,
  stripe_invoice_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  processing_fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  net_amount_cents INTEGER NOT NULL DEFAULT 0,
  payment_method_type TEXT NOT NULL DEFAULT 'card',
  status invoice_status NOT NULL DEFAULT 'draft',
  stripe_hosted_url TEXT,
  stripe_pdf_url TEXT,
  metadata JSONB,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices (invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON public.invoices (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices (created_by, created_at DESC);

-- Invoice line items store the detail lines synced to Stripe
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  line_type invoice_line_type NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON public.invoice_line_items (invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_created_by ON public.invoice_line_items (created_by, created_at DESC);

-- Enable row level security
ALTER TABLE public.billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (owner can manage)
DO $$
BEGIN
  PERFORM 1;
END
$$;

DROP POLICY IF EXISTS billing_periods_policy ON public.billing_periods;
CREATE POLICY billing_periods_policy
  ON public.billing_periods
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS usage_events_policy ON public.usage_events;
CREATE POLICY usage_events_policy
  ON public.usage_events
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS invoices_policy ON public.invoices;
CREATE POLICY invoices_policy
  ON public.invoices
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS invoice_line_items_policy ON public.invoice_line_items;
CREATE POLICY invoice_line_items_policy
  ON public.invoice_line_items
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

COMMIT;

