import { pool } from '../config/database';

export interface HealthCheckin {
  id: string;
  checkin_date: string;
  checkin_type: 'edibles' | 'workout' | 'wealth' | 'milestone' | 'vibe';
  prompt_sent_at: Date | null;
  response_text: string | null;
  response_received_at: Date | null;
  parsed_data: any;
  notes: string | null;
  created_at: Date;
}

export interface CreateCheckinInput {
  checkin_date: string;
  checkin_type: HealthCheckin['checkin_type'];
  prompt_sent_at?: Date;
  notes?: string;
}

class HealthCheckinRepository {
  async create(input: CreateCheckinInput): Promise<HealthCheckin> {
    const result = await pool.query(
      `INSERT INTO health_checkins (checkin_date, checkin_type, prompt_sent_at, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.checkin_date, input.checkin_type, input.prompt_sent_at || new Date(), input.notes || null]
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<HealthCheckin | null> {
    const result = await pool.query('SELECT * FROM health_checkins WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async findTodayByType(checkinType: string): Promise<HealthCheckin | null> {
    const result = await pool.query(
      `SELECT * FROM health_checkins
       WHERE checkin_date = CURRENT_DATE AND checkin_type = $1
       ORDER BY created_at DESC LIMIT 1`,
      [checkinType]
    );
    return result.rows[0] || null;
  }

  async findToday(): Promise<HealthCheckin[]> {
    const result = await pool.query(
      `SELECT * FROM health_checkins
       WHERE checkin_date = CURRENT_DATE
       ORDER BY created_at DESC`
    );
    return result.rows;
  }

  async recordResponse(id: string, responseText: string, parsedData?: any): Promise<HealthCheckin> {
    const result = await pool.query(
      `UPDATE health_checkins
       SET response_text = $2, response_received_at = NOW(), parsed_data = $3
       WHERE id = $1
       RETURNING *`,
      [id, responseText, parsedData ? JSON.stringify(parsedData) : null]
    );
    return result.rows[0];
  }

  async findPendingResponse(): Promise<HealthCheckin | null> {
    const result = await pool.query(
      `SELECT * FROM health_checkins
       WHERE response_text IS NULL AND prompt_sent_at IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`
    );
    return result.rows[0] || null;
  }

  async findRecent(limit: number = 7): Promise<HealthCheckin[]> {
    const result = await pool.query(
      `SELECT * FROM health_checkins
       WHERE response_text IS NOT NULL
       ORDER BY checkin_date DESC, created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

export const healthCheckinRepository = new HealthCheckinRepository();
