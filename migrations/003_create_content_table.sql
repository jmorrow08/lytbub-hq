-- Create content table
CREATE TABLE content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  views INTEGER DEFAULT 0 CHECK (views >= 0),
  url TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_content_platform ON content(platform);
CREATE INDEX idx_content_created_at ON content(created_at DESC);
CREATE INDEX idx_content_published_at ON content(published_at DESC);
