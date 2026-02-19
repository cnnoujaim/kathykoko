-- Add phone_number to user_accounts so each account can have its own SMS number
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);

-- Index for fast lookup when receiving SMS
CREATE INDEX IF NOT EXISTS idx_user_accounts_phone ON user_accounts(phone_number) WHERE phone_number IS NOT NULL;

-- Backfill: copy existing users.phone_number to the primary account
UPDATE user_accounts ua
SET phone_number = u.phone_number
FROM users u
WHERE ua.user_id = u.id
  AND ua.is_primary = true
  AND u.phone_number IS NOT NULL
  AND ua.phone_number IS NULL;
