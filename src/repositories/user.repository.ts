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

  /**
   * Look up user + account by phone number on user_accounts.
   * Falls back to users.phone_number if no account match.
   */
  async findByPhoneWithAccount(phone: string): Promise<{ user: UserRow; accountId: string | null; accountType: string | null } | null> {
    // First try user_accounts.phone_number for account-level match
    try {
      const accountMatch = await pool.query(
        `SELECT u.*, ua.id as account_id, ua.account_type
         FROM user_accounts ua
         JOIN users u ON ua.user_id = u.id
         WHERE ua.phone_number = $1
         LIMIT 1`,
        [phone]
      );

      if (accountMatch.rows.length > 0) {
        const row = accountMatch.rows[0];
        return {
          user: {
            id: row.id,
            email: row.email,
            name: row.name,
            avatar_url: row.avatar_url,
            phone_number: row.phone_number,
            created_at: row.created_at,
            updated_at: row.updated_at,
          },
          accountId: row.account_id,
          accountType: row.account_type,
        };
      }
    } catch {
      // phone_number column may not exist yet (pre-migration 014)
    }

    // Fall back to users.phone_number
    const userMatch = await this.findByPhoneNumber(phone);
    if (userMatch) {
      return { user: userMatch, accountId: null, accountType: null };
    }

    return null;
  }
}

export const userRepository = new UserRepository();
