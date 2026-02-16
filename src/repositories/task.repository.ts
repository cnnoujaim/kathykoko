import { pool } from '../config/database';
import { Task, CreateTaskInput } from '../types/task.types';

export class TaskRepository {
  /**
   * Create a new task
   */
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
      created_from_message_sid,
    } = input;

    const result = await pool.query(
      `INSERT INTO tasks (
        raw_text, parsed_title, description, priority, category, status,
        alignment_score, pushback_reason, due_date, estimated_hours,
        account_id, created_from_message_sid
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        raw_text,
        parsed_title,
        description,
        priority,
        category,
        status,
        alignment_score,
        pushback_reason,
        due_date,
        estimated_hours,
        account_id,
        created_from_message_sid,
      ]
    );

    return result.rows[0];
  }

  /**
   * Find task by ID
   */
  async findById(id: string): Promise<Task | null> {
    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  /**
   * Find task by message SID
   */
  async findByMessageSid(messageSid: string): Promise<Task | null> {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE created_from_message_sid = $1',
      [messageSid]
    );
    return result.rows[0] || null;
  }

  /**
   * Update task status
   */
  async updateStatus(
    id: string,
    status: Task['status'],
    completedAt?: Date
  ): Promise<Task> {
    const result = await pool.query(
      `UPDATE tasks
       SET status = $1, completed_at = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, completedAt || null, id]
    );

    return result.rows[0];
  }

  /**
   * List tasks by status
   */
  async listByStatus(status: Task['status'], limit: number = 50): Promise<Task[]> {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
      [status, limit]
    );
    return result.rows;
  }

  /**
   * List tasks by category
   */
  async listByCategory(
    category: Task['category'],
    limit: number = 50
  ): Promise<Task[]> {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE category = $1 ORDER BY created_at DESC LIMIT $2',
      [category, limit]
    );
    return result.rows;
  }

  /**
   * Search tasks by title (fuzzy ILIKE match)
   */
  async findByTitleLike(search: string, limit: number = 5): Promise<Task[]> {
    const result = await pool.query(
      `SELECT * FROM tasks
       WHERE parsed_title ILIKE $1
         AND status NOT IN ('rejected')
       ORDER BY
         CASE WHEN parsed_title ILIKE $2 THEN 0 ELSE 1 END,
         created_at DESC
       LIMIT $3`,
      [`%${search}%`, search, limit]
    );
    return result.rows;
  }

  /**
   * Update task title
   */
  async updateTitle(id: string, title: string): Promise<Task> {
    const result = await pool.query(
      `UPDATE tasks SET parsed_title = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [title, id]
    );
    return result.rows[0];
  }

  /**
   * Update task priority
   */
  async updatePriority(id: string, priority: Task['priority']): Promise<Task> {
    const result = await pool.query(
      `UPDATE tasks SET priority = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [priority, id]
    );
    return result.rows[0];
  }

  /**
   * Update task due date
   */
  async updateDueDate(id: string, dueDate: Date | null): Promise<Task> {
    const result = await pool.query(
      `UPDATE tasks SET due_date = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [dueDate, id]
    );
    return result.rows[0];
  }

  /**
   * Update task category
   */
  async updateCategory(id: string, category: Task['category']): Promise<Task> {
    const result = await pool.query(
      `UPDATE tasks SET category = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [category, id]
    );
    return result.rows[0];
  }

  /**
   * Update task estimated hours
   */
  async updateEstimatedHours(id: string, hours: number): Promise<Task> {
    const result = await pool.query(
      `UPDATE tasks SET estimated_hours = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [hours, id]
    );
    return result.rows[0];
  }

  /**
   * Delete a task
   */
  async delete(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * List today's tasks (for morning briefing)
   */
  async listTodaysTasks(): Promise<Task[]> {
    const result = await pool.query(
      `SELECT * FROM tasks
       WHERE status IN ('pending', 'active')
       AND (due_date IS NULL OR due_date::date <= CURRENT_DATE)
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
           ELSE 5
         END,
         created_at ASC`
    );
    return result.rows;
  }
}

export const taskRepository = new TaskRepository();
