-- 008_add_user_id_columns.sql
-- Add user_id FK to all data tables for multi-tenant isolation

-- user_accounts: link Google accounts to users
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_user ON user_accounts(user_id);

-- tasks: scope to user
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);

-- Make category free-form (drop old CHECK constraint)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_category_check;

-- messages: scope to user
ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);

-- calendar_events: scope to user (in addition to account_id)
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id);

-- emails: scope to user
ALTER TABLE emails ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_emails_user ON emails(user_id);

-- email_drafts: scope to user
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_user ON email_drafts(user_id);

-- lyra_work_hours: scope to user
ALTER TABLE lyra_work_hours ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_lyra_work_hours_user ON lyra_work_hours(user_id);
