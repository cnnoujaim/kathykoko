import { pool } from '../config/database';

export interface GoalMilestone {
  id: string;
  goal_id: string;
  title: string;
  is_completed: boolean;
  completed_at: Date | null;
  sort_order: number;
  created_at: Date;
}

export class GoalMilestoneRepository {
  async listByGoal(goalId: string): Promise<GoalMilestone[]> {
    const result = await pool.query(
      'SELECT * FROM goal_milestones WHERE goal_id = $1 ORDER BY sort_order ASC, created_at ASC',
      [goalId]
    );
    return result.rows;
  }

  async listByGoals(goalIds: string[]): Promise<GoalMilestone[]> {
    if (goalIds.length === 0) return [];
    const result = await pool.query(
      'SELECT * FROM goal_milestones WHERE goal_id = ANY($1) ORDER BY sort_order ASC, created_at ASC',
      [goalIds]
    );
    return result.rows;
  }

  async create(goalId: string, title: string, sortOrder: number = 0): Promise<GoalMilestone> {
    const result = await pool.query(
      'INSERT INTO goal_milestones (goal_id, title, sort_order) VALUES ($1, $2, $3) RETURNING *',
      [goalId, title, sortOrder]
    );
    return result.rows[0];
  }

  async toggleComplete(id: string): Promise<GoalMilestone | null> {
    const result = await pool.query(
      `UPDATE goal_milestones
       SET is_completed = NOT is_completed,
           completed_at = CASE WHEN is_completed THEN NULL ELSE NOW() END
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  async updateTitle(id: string, title: string): Promise<GoalMilestone | null> {
    const result = await pool.query(
      'UPDATE goal_milestones SET title = $2 WHERE id = $1 RETURNING *',
      [id, title]
    );
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM goal_milestones WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const goalMilestoneRepository = new GoalMilestoneRepository();
