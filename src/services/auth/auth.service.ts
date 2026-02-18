import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { config } from '../../config';
import { pool } from '../../config/database';

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  created_at: Date;
  updated_at: Date;
}

const JWT_EXPIRY = '7d';
const COOKIE_NAME = 'kk_token';

export class AuthService {
  signToken(userId: string, email: string): string {
    return jwt.sign({ userId, email }, config.jwtSecret, { expiresIn: JWT_EXPIRY });
  }

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  }

  setAuthCookie(res: Response, token: string): void {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
  }

  clearAuthCookie(res: Response): void {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }

  /**
   * Find or create a user from Google profile info.
   * Returns the user row.
   */
  async findOrCreateUser(profile: {
    email: string;
    name?: string;
    avatar_url?: string;
  }): Promise<User> {
    // Try to find existing user
    const existing = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [profile.email]
    );

    if (existing.rows.length > 0) {
      // Update name/avatar if provided
      if (profile.name || profile.avatar_url) {
        const updated = await pool.query(
          `UPDATE users SET
            name = COALESCE($1, name),
            avatar_url = COALESCE($2, avatar_url),
            updated_at = NOW()
          WHERE email = $3
          RETURNING *`,
          [profile.name || null, profile.avatar_url || null, profile.email]
        );
        return updated.rows[0];
      }
      return existing.rows[0];
    }

    // Create new user
    const result = await pool.query(
      `INSERT INTO users (email, name, avatar_url)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [profile.email, profile.name || null, profile.avatar_url || null]
    );

    // Seed default categories for new user
    const userId = result.rows[0].id;
    await pool.query(
      `INSERT INTO categories (user_id, name, color, is_default, sort_order)
       VALUES ($1, 'work', '#b8c0ff', true, 0),
              ($1, 'personal', '#ffd6ff', true, 1),
              ($1, 'home', '#bbd0ff', true, 2)
       ON CONFLICT (user_id, name) DO NOTHING`,
      [userId]
    );

    console.log(`✓ Created new user: ${profile.email}`);
    return result.rows[0];
  }

  async findUserById(userId: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  }
}

export const authService = new AuthService();
