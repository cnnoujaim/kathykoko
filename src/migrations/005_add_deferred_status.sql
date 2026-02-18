-- Add 'deferred' to tasks status CHECK constraint
-- Deferred tasks are Lyra tasks saved when killswitch is active, to be revisited later

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'clarification_needed', 'active', 'completed', 'rejected', 'deferred'));
