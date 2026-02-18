import { pool } from '../config/database';
import { Task, CreateTaskInput } from '../types/task.types';

export class TaskRepository {
  async create(input: CreateTaskInput): Promise<Task> {
    const {
      raw_text,
      parsed_title,
      description,
      priority,
      category,
      status = 'pending',
      alignment_score,
      pushback_reason,
      due_date,
      estimated_hours,
      account_id,
      user_id,
      created_from_message_sid,
    } = input;

    const result = await pool.query(
      `INSERT INTO tasks (
        raw_text, parsed_title, description, priority, category, status,
        alignment_score, pushback_reason, due_date, estimated_hours,
        account_id, user_id, created_from_message_sid
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        raw_text, parsed_title, description, priority, category, status,
        alignment_score, pushback_reason, due_date, estimated_hours,
        account_id, user_id, created_from_message_sid,
      ]
    );
    return result.rows[0];
  }

  async findById(id: string, userId?: string): Promise<Task | null> {
    const query = userId
      ? 'SELECT * FROM tasks WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM tasks WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  async findByMessageSid(messageSid: string): Promise<Task | null> {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE created_from_message_sid = $1',
      [messageSid]
    );
    return result.rows[0] || null;
  }

  async updateStatus(id: string, status: Task['status'], completedAt?: Date, userId?: string): Promise<Task> {
    const query = userId
      ? `UPDATE tasks SET status = $1, completed_at = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING *`
      : `UPDATE tasks SET status = $1, completed_at = $2, updated_at = NOW() WHERE id = $3 RETURNING *`;
    const params = userId
      ? [status, completedAt || null, id, userId]
      : [status, completedAt || null, id];
    const result = await pool.query(query, params);
    return result.rows[0];
  }

  async listByStatus(status: Task['status'], limit: number = 50, userId?: string): Promise<Task[]> {
    const query = userId
      ? 'SELECT * FROM tasks WHERE status = $1 AND user_id = $3 ORDER BY created_at DESC LIMIT $2'
      : 'SELECT * FROM tasks WHERE status = $1 ORDER BY created_at DESC LIMIT $2';
    const params = userId ? [status, limit, userId] : [status, limit];
    const result = await pool.query(query, params);
    return result.rows;
  }

  async listCompletedToday(limit: number = 50, userId?: string): Promise<Task[]> {
    const query = userId
      ? `SELECT * FROM tasks WHERE status = 'completed' AND completed_at >= CURRENT_DATE AND user_id = $2 ORDER BY completed_at DESC LIMIT $1`
      : `SELECT * FROM tasks WHERE status = 'completed' AND completed_at >= CURRENT_DATE ORDER BY completed_at DESC LIMIT $1`;
    const params = userId ? [limit, userId] : [limit];
    const result = await pool.query(query, params);
    return result.rows;
  }

  async listByCategory(category: string, limit: number = 50, userId?: string): Promise<Task[]> {
    const query = userId
      ? 'SELECT * FROM tasks WHERE category = $1 AND user_id = $3 ORDER BY created_at DESC LIMIT $2'
      : 'SELECT * FROM tasks WHERE category = $1 ORDER BY created_at DESC LIMIT $2';
    const params = userId ? [category, limit, userId] : [category, limit];
    const result = await pool.query(query, params);
    return result.rows;
  }

  async findByTitleLike(search: string, limit: number = 5): Promise<Task[]> {
    const result = await pool.query(
      `SELECT * FROM tasks
       WHERE parsed_title ILIKE $1
         AND status NOT IN ('rejected', 'deferred')
       ORDER BY
         CASE WHEN parsed_title ILIKE $2 THEN 0 ELSE 1 END,
         created_at DESC
       LIMIT $3`,
      [`%${search}%`, search, limit]
    );
    return result.rows;
  }

  async updateTitle(id: string, title: string): Promise<Task> {
    const result = await pool.query(
      `UPDATE tasks SET parsed_title = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [title, id]
    );
    return result.rows[0];
  }

  async updatePriority(id: string, priority: Task['priority']): Promise<Task> {
    const result = await pool.query(
      `UPDATE tasks SET priority = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [priority, id]
    );
    return result.rows[0];
  }

  async updateDueDate(id: string, dueDate: Date | null): Promise<Task> {
    const result = await pool.query(
      `UPDATE tasks SET due_date = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [dueDate, id]
    );
    return result.rows[0];
  }

  async updateCategory(id: string, category: string): Promise<Task> {
    const result = await pool.query(
      `UPDATE tasks SET category = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [category, id]
    );
    return result.rows[0];
  }

  async updateEstimatedHours(id: string, hours: number): Promise<Task> {
    const result = await pool.query(
      `UPDATE tasks SET estimated_hours = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [hours, id]
    );
    return result.rows[0];
  }

  async delete(id: string, userId?: string): Promise<boolean> {
    const query = userId
      ? 'DELETE FROM tasks WHERE id = $1 AND user_id = $2'
      : 'DELETE FROM tasks WHERE id = $1';
    const params = userId ? [id, userId] : [id];
    const result = await pool.query(query, params);
    return (result.rowCount ?? 0) > 0;
  }

  async listTodaysTasks(userId?: string): Promise<Task[]> {
    const userFilter = userId ? ' AND user_id = $1' : '';
    const params = userId ? [userId] : [];
    const result = await pool.query(
      `SELECT * FROM tasks
       WHERE status IN ('pending', 'active')
       AND (due_date IS NULL OR due_date::date <= CURRENT_DATE)
       ${userFilter}
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
           ELSE 5
         END,
         created_at ASC`,
      params
    );
    return result.rows;
  }
}

export const taskRepository = new TaskRepository();
