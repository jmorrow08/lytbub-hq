-- Update finance schema to link payments to client projects and clean up unused clients table
BEGIN;

-- Link payments to projects marked as clients
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects (id) ON DELETE SET NULL;

-- Ensure existing rows are owned so RLS does not lock them out
DO $$
DECLARE
  orphaned_payments integer;
  unowned_payments integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'client_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'clients'
  ) THEN
    -- Align payment ownership with its legacy client record where the owner was missing
    UPDATE public.payments p
    SET created_by = c.created_by
    FROM public.clients c
    WHERE p.client_id = c.id
      AND p.created_by IS NULL;

    SELECT COUNT(*) INTO unowned_payments
    FROM public.payments
    WHERE created_by IS NULL;

    IF unowned_payments > 0 THEN
      RAISE EXCEPTION 'Cannot enable payments RLS because % payment rows still have NULL created_by values. Backfill them before rerunning migration.', unowned_payments;
    END IF;

    -- If any payments reference a missing client, fail so data can be repaired first
    SELECT COUNT(*) INTO orphaned_payments
    FROM public.payments p
    WHERE p.client_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE c.id = p.client_id
      );

    IF orphaned_payments > 0 THEN
      RAISE EXCEPTION 'Cannot drop clients until % payment rows referencing deleted clients are reassigned.', orphaned_payments;
    END IF;
  END IF;
END $$;

-- Remove legacy clients reference from payments once data is copied
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_client_id_fkey,
  DROP COLUMN IF EXISTS client_id;

-- Ensure RLS policies exist after altering the table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_select_policy ON public.payments;
DROP POLICY IF EXISTS payments_insert_policy ON public.payments;
DROP POLICY IF EXISTS payments_update_policy ON public.payments;
DROP POLICY IF EXISTS payments_delete_policy ON public.payments;

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

CREATE POLICY payments_delete_policy
  ON public.payments
  FOR DELETE
  USING (auth.uid() = created_by);

-- Drop unused clients table since projects with type=client now represent clients
DROP TABLE IF EXISTS public.clients;

COMMIT;
