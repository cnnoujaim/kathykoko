import { pool } from '../config/database';
import { Message, CreateMessageInput } from '../types/message.types';

export class MessageRepository {
  /**
   * Create a new message
   */
  async create(input: CreateMessageInput): Promise<Message> {
    const {
      message_sid,
      direction,
      from_number,
      to_number,
      body,
      status = 'received',
      task_id,
    } = input;

    const result = await pool.query(
      `INSERT INTO messages (
        message_sid, direction, from_number, to_number, body, status, task_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [message_sid, direction, from_number, to_number, body, status, task_id]
    );

    return result.rows[0];
  }

  /**
   * Check if message has been processed (idempotency check)
   */
  async isProcessed(messageSid: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT id FROM messages WHERE message_sid = $1',
      [messageSid]
    );
    return result.rows.length > 0;
  }

  /**
   * Find message by SID
   */
  async findBySid(messageSid: string): Promise<Message | null> {
    const result = await pool.query(
      'SELECT * FROM messages WHERE message_sid = $1',
      [messageSid]
    );
    return result.rows[0] || null;
  }

  /**
   * Update message status
   */
  async updateStatus(
    messageSid: string,
    status: Message['status'],
    taskId?: string
  ): Promise<Message> {
    const result = await pool.query(
      `UPDATE messages
       SET status = $1, processed_at = NOW(), task_id = $2
       WHERE message_sid = $3
       RETURNING *`,
      [status, taskId || null, messageSid]
    );

    return result.rows[0];
  }

  /**
   * List recent messages
   */
  async listRecent(limit: number = 50): Promise<Message[]> {
    const result = await pool.query(
      'SELECT * FROM messages ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }
}

export const messageRepository = new MessageRepository();
