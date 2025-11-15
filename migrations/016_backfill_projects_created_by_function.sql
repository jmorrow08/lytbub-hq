BEGIN;

-- Creates a SECURITY DEFINER RPC that assigns ownership of any existing
-- projects with NULL created_by to the caller (auth.uid()).
-- Returns the list of updated project ids for transparency.
CREATE OR REPLACE FUNCTION public.backfill_projects_created_by()
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.projects p
  SET created_by = auth.uid(),
      updated_at = NOW()
  WHERE p.created_by IS NULL
  RETURNING p.id;
END;
$$;

COMMENT ON FUNCTION public.backfill_projects_created_by() IS
'Backfills projects.created_by for rows where it is NULL, assigning them to the current authenticated user (auth.uid()).';

-- Allow authenticated users to execute the backfill
GRANT EXECUTE ON FUNCTION public.backfill_projects_created_by() TO authenticated;

COMMIT;


