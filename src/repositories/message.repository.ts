import { pool } from '../config/database';
import { Message, CreateMessageInput } from '../types/message.types';

export class MessageRepository {
  async create(input: CreateMessageInput): Promise<Message> {
    const {
      message_sid, direction, from_number, to_number,
      body, status = 'received', task_id, user_id,
    } = input;

    const result = await pool.query(
      `INSERT INTO messages (
        message_sid, direction, from_number, to_number, body, status, task_id, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [message_sid, direction, from_number, to_number, body, status, task_id, user_id]
    );
    return result.rows[0];
  }

  async isProcessed(messageSid: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT id FROM messages WHERE message_sid = $1',
      [messageSid]
    );
    return result.rows.length > 0;
  }

  async findBySid(messageSid: string): Promise<Message | null> {
    const result = await pool.query(
      'SELECT * FROM messages WHERE message_sid = $1',
      [messageSid]
    );
    return result.rows[0] || null;
  }

  async updateStatus(messageSid: string, status: Message['status'], taskId?: string): Promise<Message> {
    const result = await pool.query(
      `UPDATE messages SET status = $1, processed_at = NOW(), task_id = $2 WHERE message_sid = $3 RETURNING *`,
      [status, taskId || null, messageSid]
    );
    return result.rows[0];
  }

  async listRecent(limit: number = 50, userId?: string): Promise<Message[]> {
    const query = userId
      ? 'SELECT * FROM messages WHERE user_id = $2 ORDER BY created_at DESC LIMIT $1'
      : 'SELECT * FROM messages ORDER BY created_at DESC LIMIT $1';
    const params = userId ? [limit, userId] : [limit];
    const result = await pool.query(query, params);
    return result.rows;
  }
}

export const messageRepository = new MessageRepository();
