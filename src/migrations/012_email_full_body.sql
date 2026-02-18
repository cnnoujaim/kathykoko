-- 012: Add full body column to emails table
-- Previously we only stored a 500-char body_preview, making ghostwriter drafts poor quality

ALTER TABLE emails ADD COLUMN IF NOT EXISTS body TEXT;
