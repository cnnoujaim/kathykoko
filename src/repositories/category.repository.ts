import { pool } from '../config/database';

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  is_default: boolean;
  sort_order: number;
  created_at: Date;
}

export class CategoryRepository {
  async listByUser(userId: string): Promise<Category[]> {
    const result = await pool.query(
      'SELECT * FROM categories WHERE user_id = $1 ORDER BY sort_order ASC',
      [userId]
    );
    return result.rows;
  }

  async create(userId: string, name: string, color?: string): Promise<Category> {
    // Get next sort_order
    const maxOrder = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM categories WHERE user_id = $1',
      [userId]
    );

    const result = await pool.query(
      `INSERT INTO categories (user_id, name, color, is_default, sort_order)
       VALUES ($1, $2, $3, false, $4)
       RETURNING *`,
      [userId, name, color || null, maxOrder.rows[0].next_order]
    );
    return result.rows[0];
  }

  async update(id: string, userId: string, name?: string, color?: string): Promise<Category | null> {
    const result = await pool.query(
      `UPDATE categories SET
        name = COALESCE($1, name),
        color = COALESCE($2, color)
      WHERE id = $3 AND user_id = $4
      RETURNING *`,
      [name || null, color || null, id, userId]
    );
    return result.rows[0] || null;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    // Don't allow deleting default categories
    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2 AND is_default = false',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getCategoryNames(userId: string): Promise<string[]> {
    const result = await pool.query(
      'SELECT name FROM categories WHERE user_id = $1 ORDER BY sort_order ASC',
      [userId]
    );
    return result.rows.map(r => r.name);
  }
}

export const categoryRepository = new CategoryRepository();
