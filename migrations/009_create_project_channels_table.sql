-- Create enum for project channels
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_channel_platform') THEN
    CREATE TYPE project_channel_platform AS ENUM (
      'youtube',
      'instagram',
      'tiktok',
      'twitter',
      'linkedin',
      'website',
      'podcast',
      'newsletter',
      'other'
    );
  END IF;
END $$;

CREATE TABLE project_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform project_channel_platform NOT NULL,
  handle TEXT,
  url TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_project_channels_project_id ON project_channels(project_id);
CREATE INDEX idx_project_channels_platform ON project_channels(platform);
