import { pool } from '../config/database';

export interface Goal {
  id: string;
  category: string;
  title: string;
  description: string;
  priority: number;
  target_date: Date | null;
  success_criteria: string | null;
  embedding: number[] | null;
  is_active: boolean;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGoalInput {
  category: string;
  title: string;
  description: string;
  priority?: number;
  target_date?: Date;
  success_criteria?: string;
  embedding?: number[];
  user_id?: string;
}

export class GoalRepository {
  async create(input: CreateGoalInput): Promise<Goal> {
    const {
      category,
      title,
      description,
      priority = 1,
      target_date,
      success_criteria,
      embedding,
      user_id,
    } = input;

    const embeddingValue = embedding ? `[${embedding.join(',')}]` : null;

    const result = await pool.query(
      `INSERT INTO cultivation_goals (
        category, title, description, priority, target_date, success_criteria, embedding, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [category, title, description, priority, target_date, success_criteria, embeddingValue, user_id]
    );

    return result.rows[0];
  }

  async findById(id: string, userId?: string): Promise<Goal | null> {
    const userFilter = userId ? ' AND user_id = $2' : '';
    const params = userId ? [id, userId] : [id];
    const result = await pool.query(
      `SELECT * FROM cultivation_goals WHERE id = $1${userFilter}`,
      params
    );
    return result.rows[0] || null;
  }

  async findAll(userId?: string): Promise<Goal[]> {
    const userFilter = userId ? ' AND user_id = $1' : '';
    const params = userId ? [userId] : [];
    const result = await pool.query(
      `SELECT * FROM cultivation_goals WHERE is_active = true${userFilter} ORDER BY priority ASC, created_at ASC`,
      params
    );
    return result.rows;
  }

  async findByCategory(category: string, userId?: string): Promise<Goal[]> {
    const userFilter = userId ? ' AND user_id = $2' : '';
    const params = userId ? [category, userId] : [category];
    const result = await pool.query(
      `SELECT * FROM cultivation_goals WHERE category = $1 AND is_active = true${userFilter} ORDER BY priority ASC`,
      params
    );
    return result.rows;
  }

  async findSimilar(embedding: number[], limit: number = 5, userId?: string): Promise<Array<Goal & { similarity: number }>> {
    const embeddingValue = `[${embedding.join(',')}]`;
    const userFilter = userId ? ' AND user_id = $3' : '';
    const params: (string | number)[] = [embeddingValue, limit];
    if (userId) params.push(userId);

    const result = await pool.query(
      `SELECT
        id, category, title, description, priority, target_date, success_criteria,
        embedding, is_active, user_id, created_at, updated_at,
        1 - (embedding <=> $1::vector) as similarity
      FROM cultivation_goals
      WHERE is_active = true AND embedding IS NOT NULL${userFilter}
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
      params
    );

    return result.rows;
  }

  async update(id: string, data: Partial<Pick<Goal, 'title' | 'description' | 'category' | 'priority' | 'target_date' | 'success_criteria' | 'is_active'>>, userId?: string): Promise<Goal | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.title !== undefined) { sets.push(`title = $${idx++}`); params.push(data.title); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
    if (data.category !== undefined) { sets.push(`category = $${idx++}`); params.push(data.category); }
    if (data.priority !== undefined) { sets.push(`priority = $${idx++}`); params.push(data.priority); }
    if (data.target_date !== undefined) { sets.push(`target_date = $${idx++}`); params.push(data.target_date); }
    if (data.success_criteria !== undefined) { sets.push(`success_criteria = $${idx++}`); params.push(data.success_criteria); }
    if (data.is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(data.is_active); }

    sets.push('updated_at = NOW()');

    const idParam = `$${idx++}`;
    params.push(id);

    let userFilter = '';
    if (userId) {
      userFilter = ` AND user_id = $${idx++}`;
      params.push(userId);
    }

    const result = await pool.query(
      `UPDATE cultivation_goals SET ${sets.join(', ')} WHERE id = ${idParam}${userFilter} RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  async updateEmbedding(id: string, embedding: number[]): Promise<void> {
    const embeddingValue = `[${embedding.join(',')}]`;
    await pool.query(
      'UPDATE cultivation_goals SET embedding = $1, updated_at = NOW() WHERE id = $2',
      [embeddingValue, id]
    );
  }

  async delete(id: string, userId?: string): Promise<boolean> {
    const userFilter = userId ? ' AND user_id = $2' : '';
    const params = userId ? [id, userId] : [id];
    const result = await pool.query(
      `DELETE FROM cultivation_goals WHERE id = $1${userFilter}`,
      params
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteAll(): Promise<void> {
    await pool.query('DELETE FROM cultivation_goals');
  }
}

export const goalRepository = new GoalRepository();
