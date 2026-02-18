-- 010: Add user_id to cultivation_goals + create goal_milestones table

-- Create cultivation_goals table if it doesn't exist (may not exist if pgvector migration was skipped)
CREATE TABLE IF NOT EXISTS cultivation_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 1 CHECK (priority >= 1 AND priority <= 5),
  target_date DATE,
  success_criteria TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add user_id to cultivation_goals
ALTER TABLE cultivation_goals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Drop the old category CHECK constraint to allow custom categories
ALTER TABLE cultivation_goals DROP CONSTRAINT IF EXISTS cultivation_goals_category_check;

-- Create milestones table for manual progress tracking
CREATE TABLE IF NOT EXISTS goal_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES cultivation_goals(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal ON goal_milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_cultivation_goals_user ON cultivation_goals(user_id);
