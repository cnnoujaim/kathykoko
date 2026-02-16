import { pool } from '../config/database';

export interface Goal {
  id: string;
  category: 'persephone' | 'lyra' | 'bloom' | 'sanctuary';
  title: string;
  description: string;
  priority: number;
  target_date: Date | null;
  success_criteria: string | null;
  embedding: number[] | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGoalInput {
  category: Goal['category'];
  title: string;
  description: string;
  priority?: number;
  target_date?: Date;
  success_criteria?: string;
  embedding?: number[];
}

export class GoalRepository {
  /**
   * Create a new goal with embedding
   */
  async create(input: CreateGoalInput): Promise<Goal> {
    const {
      category,
      title,
      description,
      priority = 1,
      target_date,
      success_criteria,
      embedding,
    } = input;

    const embeddingValue = embedding ? `[${embedding.join(',')}]` : null;

    const result = await pool.query(
      `INSERT INTO cultivation_goals (
        category, title, description, priority, target_date, success_criteria, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [category, title, description, priority, target_date, success_criteria, embeddingValue]
    );

    return result.rows[0];
  }

  /**
   * Find all active goals
   */
  async findAll(): Promise<Goal[]> {
    const result = await pool.query(
      'SELECT * FROM cultivation_goals WHERE is_active = true ORDER BY priority ASC, created_at ASC'
    );
    return result.rows;
  }

  /**
   * Find goals by category
   */
  async findByCategory(category: Goal['category']): Promise<Goal[]> {
    const result = await pool.query(
      'SELECT * FROM cultivation_goals WHERE category = $1 AND is_active = true ORDER BY priority ASC',
      [category]
    );
    return result.rows;
  }

  /**
   * Find similar goals using vector similarity search
   */
  async findSimilar(embedding: number[], limit: number = 5): Promise<Array<Goal & { similarity: number }>> {
    const embeddingValue = `[${embedding.join(',')}]`;

    const result = await pool.query(
      `SELECT
        id, category, title, description, priority, target_date, success_criteria,
        embedding, is_active, created_at, updated_at,
        1 - (embedding <=> $1::vector) as similarity
      FROM cultivation_goals
      WHERE is_active = true AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
      [embeddingValue, limit]
    );

    return result.rows;
  }

  /**
   * Delete all goals (for re-seeding)
   */
  async deleteAll(): Promise<void> {
    await pool.query('DELETE FROM cultivation_goals');
  }
}

export const goalRepository = new GoalRepository();
