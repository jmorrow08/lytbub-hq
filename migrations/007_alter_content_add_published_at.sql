-- Add published_at column to content table if it does not exist
ALTER TABLE public.content
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Create index on published_at to support queries/sorting
CREATE INDEX IF NOT EXISTS idx_content_published_at
  ON public.content (published_at DESC);
