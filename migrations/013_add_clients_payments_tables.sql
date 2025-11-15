-- Add clients and payments tables with RLS policies
BEGIN;

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_created_by ON public.clients (created_by, created_at DESC);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_select_policy ON public.clients;
DROP POLICY IF EXISTS clients_insert_policy ON public.clients;
DROP POLICY IF EXISTS clients_update_policy ON public.clients;

CREATE POLICY clients_select_policy
  ON public.clients
  FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY clients_insert_policy
  ON public.clients
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY clients_update_policy
  ON public.clients
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  description TEXT,
  link_type TEXT NOT NULL CHECK (link_type IN ('checkout_session', 'payment_link')),
  stripe_id TEXT,
  url TEXT NOT NULL,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_created_by ON public.payments (created_by, created_at DESC);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_select_policy ON public.payments;
DROP POLICY IF EXISTS payments_insert_policy ON public.payments;
DROP POLICY IF EXISTS payments_update_policy ON public.payments;

CREATE POLICY payments_select_policy
  ON public.payments
  FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY payments_insert_policy
  ON public.payments
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY payments_update_policy
  ON public.payments
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

COMMIT;
