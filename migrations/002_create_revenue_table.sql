-- Create revenue table
CREATE TABLE revenue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on created_at for chronological queries
CREATE INDEX idx_revenue_created_at ON revenue(created_at DESC);
CREATE INDEX idx_revenue_source ON revenue(source);
