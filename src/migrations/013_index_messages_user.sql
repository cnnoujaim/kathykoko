-- Index for fast retrieval of recent messages by user (used for multi-turn chat history)
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at DESC);
