-- Add public share + portal payload support for client-facing invoice microsite
-- Safe to run multiple times.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_share_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS public_share_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_payload jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_invoices_public_share
  ON public.invoices (public_share_id, public_share_expires_at);
