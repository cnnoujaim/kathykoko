import { pool } from '../config/database';

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  created_at: Date;
  updated_at: Date;
}

export class UserRepository {
  async findById(id: string): Promise<UserRow | null> {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  }

  async findByPhoneNumber(phone: string): Promise<UserRow | null> {
    const result = await pool.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
    return result.rows[0] || null;
  }

  async listAll(): Promise<UserRow[]> {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
    return result.rows;
  }

  async updatePhoneNumber(id: string, phone: string): Promise<UserRow> {
    const result = await pool.query(
      'UPDATE users SET phone_number = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [phone, id]
    );
    return result.rows[0];
  }
}

export const userRepository = new UserRepository();
