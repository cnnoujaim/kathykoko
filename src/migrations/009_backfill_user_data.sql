-- 009_backfill_user_data.sql
-- Backfill existing data: create user from primary account, set user_id everywhere
-- NOTE: Run this ONCE after 006-008. It's idempotent.

-- Step 1: Create user from primary account (or first account)
INSERT INTO users (email, name)
SELECT email, display_name FROM user_accounts
WHERE is_primary = true
LIMIT 1
ON CONFLICT (email) DO NOTHING;

-- If no primary account, use the first account
INSERT INTO users (email, name)
SELECT email, display_name FROM user_accounts
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (email) DO NOTHING;

-- Step 2: Link all user_accounts to this user
UPDATE user_accounts SET user_id = (SELECT id FROM users LIMIT 1)
WHERE user_id IS NULL;

-- Step 3: Backfill user_id on tasks
UPDATE tasks SET user_id = (SELECT id FROM users LIMIT 1)
WHERE user_id IS NULL;

-- Step 4: Backfill user_id on messages
UPDATE messages SET user_id = (SELECT id FROM users LIMIT 1)
WHERE user_id IS NULL;

-- Step 5: Backfill user_id on calendar_events
UPDATE calendar_events SET user_id = (SELECT id FROM users LIMIT 1)
WHERE user_id IS NULL;

-- Step 6: Backfill user_id on emails
UPDATE emails SET user_id = (SELECT id FROM users LIMIT 1)
WHERE user_id IS NULL;

-- Step 7: Backfill user_id on email_drafts
UPDATE email_drafts SET user_id = (SELECT id FROM users LIMIT 1)
WHERE user_id IS NULL;

-- Step 8: Backfill user_id on lyra_work_hours
UPDATE lyra_work_hours SET user_id = (SELECT id FROM users LIMIT 1)
WHERE user_id IS NULL;

-- Step 9: Seed default categories for the user
INSERT INTO categories (user_id, name, color, is_default, sort_order)
SELECT u.id, c.name, c.color, true, c.sort_order
FROM users u,
(VALUES
  ('work', '#b8c0ff', 0),
  ('personal', '#ffd6ff', 1),
  ('home', '#bbd0ff', 2)
) AS c(name, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE categories.user_id = u.id AND categories.name = c.name
);
