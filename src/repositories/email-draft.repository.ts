import { pool } from '../config/database';

export interface EmailDraft {
  id: string;
  email_id: string;
  persona: 'lyra' | 'music' | 'contractor';
  subject: string;
  body: string;
  tone_notes: string | null;
  status: 'draft' | 'approved' | 'sent' | 'rejected';
  sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDraftInput {
  email_id: string;
  persona: 'lyra' | 'music' | 'contractor';
  subject: string;
  body: string;
  tone_notes?: string;
}

export class EmailDraftRepository {
  async create(input: CreateDraftInput): Promise<EmailDraft> {
    const result = await pool.query(
      `INSERT INTO email_drafts (email_id, persona, subject, body, tone_notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.email_id, input.persona, input.subject, input.body, input.tone_notes]
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<EmailDraft | null> {
    const result = await pool.query('SELECT * FROM email_drafts WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async findByEmailId(emailId: string): Promise<EmailDraft[]> {
    const result = await pool.query(
      'SELECT * FROM email_drafts WHERE email_id = $1 ORDER BY created_at DESC',
      [emailId]
    );
    return result.rows;
  }

  async findPending(userId?: string): Promise<EmailDraft[]> {
    const userFilter = userId
      ? ' AND e.account_id IN (SELECT id FROM user_accounts WHERE user_id = $1)'
      : '';
    const params = userId ? [userId] : [];

    const result = await pool.query(
      `SELECT ed.*, e.from_address, e.subject as original_subject, e.snippet
       FROM email_drafts ed
       JOIN emails e ON ed.email_id = e.id
       WHERE ed.status = 'draft'${userFilter}
       ORDER BY ed.created_at DESC
       LIMIT 20`,
      params
    );
    return result.rows;
  }

  async updateStatus(id: string, status: EmailDraft['status']): Promise<void> {
    const sentAt = status === 'sent' ? 'NOW()' : 'NULL';
    await pool.query(
      `UPDATE email_drafts SET status = $1, sent_at = ${sentAt}, updated_at = NOW() WHERE id = $2`,
      [status, id]
    );
  }

  async updateBody(id: string, body: string): Promise<void> {
    await pool.query(
      'UPDATE email_drafts SET body = $1, updated_at = NOW() WHERE id = $2',
      [body, id]
    );
  }
}

export const emailDraftRepository = new EmailDraftRepository();
