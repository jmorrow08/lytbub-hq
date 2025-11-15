BEGIN;

DO $$
DECLARE
  fallback_user uuid;
BEGIN
  SELECT id INTO fallback_user
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  IF fallback_user IS NULL THEN
    RAISE EXCEPTION 'Cannot backfill project ownership because auth.users is empty.';
  END IF;

  UPDATE public.projects p
  SET created_by = COALESCE(
    (
      SELECT pay.created_by
      FROM public.payments pay
      WHERE pay.project_id = p.id
      ORDER BY pay.created_at DESC
      LIMIT 1
    ),
    fallback_user
  )
  WHERE p.created_by IS NULL;
END $$;

ALTER TABLE public.projects
  ALTER COLUMN created_by SET NOT NULL;

COMMIT;


