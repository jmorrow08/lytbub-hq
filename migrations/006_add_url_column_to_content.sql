-- Ensure the content table has a url column so the UI can store outbound links
ALTER TABLE public.content
  ADD COLUMN IF NOT EXISTS url TEXT;
