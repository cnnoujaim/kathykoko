-- 011: Backfill existing goals with user_id from first user

UPDATE cultivation_goals
SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
WHERE user_id IS NULL;
