-- 002_add_pgvector.sql
-- Enable pgvector extension and create cultivation_goals table with embeddings

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Cultivation Goals (2026 goals with embeddings for semantic search)
CREATE TABLE IF NOT EXISTS cultivation_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL CHECK (category IN ('persephone', 'lyra', 'bloom', 'sanctuary')),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 1 CHECK (priority >= 1 AND priority <= 5),
  target_date DATE,
  success_criteria TEXT,
  embedding vector(1536),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cultivation_goals_category ON cultivation_goals(category);
CREATE INDEX IF NOT EXISTS idx_cultivation_goals_active ON cultivation_goals(is_active);

-- Vector similarity index (IVFFlat for fast cosine similarity search)
-- Note: This requires at least 1000 rows for optimal performance
-- For MVP with fewer goals, we'll use brute-force search initially
CREATE INDEX IF NOT EXISTS idx_cultivation_goals_embedding
  ON cultivation_goals
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Update timestamp trigger
CREATE TRIGGER update_cultivation_goals_updated_at BEFORE UPDATE ON cultivation_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
