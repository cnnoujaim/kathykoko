import { pool } from '../config/database';

export interface Email {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  account_id: string;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  snippet: string;
  body_preview: string;
  body: string | null;
  labels: string[];
  is_urgent: boolean;
  urgency_reason: string | null;
  is_read: boolean;
  has_draft: boolean;
  draft_id: string | null;
  received_at: Date;
  flagged_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEmailInput {
  gmail_message_id: string;
  gmail_thread_id?: string;
  account_id: string;
  from_address: string;
  to_addresses?: string[];
  cc_addresses?: string[];
  subject: string;
  snippet?: string;
  body_preview?: string;
  body?: string;
  labels?: string[];
  is_urgent?: boolean;
  urgency_reason?: string;
  is_read?: boolean;
  received_at: Date;
}

export class EmailRepository {
  async upsert(input: CreateEmailInput): Promise<Email> {
    const result = await pool.query(
      `INSERT INTO emails (
        gmail_message_id, gmail_thread_id, account_id, from_address,
        to_addresses, cc_addresses, subject, snippet, body_preview, body,
        labels, is_urgent, urgency_reason, is_read, received_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (gmail_message_id)
      DO UPDATE SET
        labels = $11,
        is_urgent = $12,
        urgency_reason = $13,
        is_read = $14,
        body = COALESCE($10, emails.body),
        updated_at = NOW()
      RETURNING *`,
      [
        input.gmail_message_id,
        input.gmail_thread_id,
        input.account_id,
        input.from_address,
        input.to_addresses || [],
        input.cc_addresses || [],
        input.subject,
        input.snippet,
        input.body_preview,
        input.body || null,
        input.labels || [],
        input.is_urgent || false,
        input.urgency_reason,
        input.is_read || false,
        input.received_at,
      ]
    );
    return result.rows[0];
  }

  async findByGmailId(gmailMessageId: string): Promise<Email | null> {
    const result = await pool.query(
      'SELECT * FROM emails WHERE gmail_message_id = $1',
      [gmailMessageId]
    );
    return result.rows[0] || null;
  }

  async findUrgentUnread(accountId?: string): Promise<Email[]> {
    const query = accountId
      ? 'SELECT * FROM emails WHERE is_urgent = true AND is_read = false AND account_id = $1 ORDER BY received_at DESC LIMIT 20'
      : 'SELECT * FROM emails WHERE is_urgent = true AND is_read = false ORDER BY received_at DESC LIMIT 20';
    const params = accountId ? [accountId] : [];
    const result = await pool.query(query, params);
    return result.rows;
  }

  async findRecent(limit: number = 20): Promise<Email[]> {
    const result = await pool.query(
      'SELECT * FROM emails ORDER BY received_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }

  async findByAccountId(accountId: string, limit: number = 20): Promise<Email[]> {
    const result = await pool.query(
      'SELECT * FROM emails WHERE account_id = $1 ORDER BY received_at DESC LIMIT $2',
      [accountId, limit]
    );
    return result.rows;
  }

  async markUrgent(id: string, reason: string): Promise<void> {
    await pool.query(
      `UPDATE emails SET is_urgent = true, urgency_reason = $2, flagged_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id, reason]
    );
  }

  async markHasDraft(id: string, draftId: string): Promise<void> {
    await pool.query(
      'UPDATE emails SET has_draft = true, draft_id = $2, updated_at = NOW() WHERE id = $1',
      [id, draftId]
    );
  }

  async markRead(id: string): Promise<void> {
    await pool.query(
      'UPDATE emails SET is_read = true, updated_at = NOW() WHERE id = $1',
      [id]
    );
  }

  async getUnprocessedCount(): Promise<number> {
    const result = await pool.query(
      'SELECT COUNT(*) FROM emails WHERE is_read = false'
    );
    return parseInt(result.rows[0].count);
  }
}

export const emailRepository = new EmailRepository();
