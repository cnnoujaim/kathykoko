import { pool } from '../config/database';

interface LyraWorkWeek {
  id: string;
  week_start_date: string;
  total_hours: number;
  events: any[];
  alert_sent_at: string | null;
  killswitch_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export class LyraWorkHoursRepository {
  /**
   * Get the Monday of the current week
   */
  getWeekStart(date: Date = new Date()): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    d.setDate(diff);
    return d;
  }

  /**
   * Get or create the current week's record
   */
  async getOrCreateWeek(weekStart?: Date): Promise<LyraWorkWeek> {
    const start = weekStart || this.getWeekStart();
    const dateStr = start.toISOString().split('T')[0];

    const result = await pool.query(
      `INSERT INTO lyra_work_hours (week_start_date, total_hours, events)
       VALUES ($1, 0, '[]'::jsonb)
       ON CONFLICT (week_start_date) DO NOTHING
       RETURNING *`,
      [dateStr]
    );

    if (result.rows.length > 0) return result.rows[0];

    const existing = await pool.query(
      'SELECT * FROM lyra_work_hours WHERE week_start_date = $1',
      [dateStr]
    );
    return existing.rows[0];
  }

  /**
   * Update total hours and events for the week
   */
  async updateHours(weekStartDate: string, totalHours: number, events: any[]): Promise<LyraWorkWeek> {
    const result = await pool.query(
      `UPDATE lyra_work_hours
       SET total_hours = $2, events = $3::jsonb, updated_at = NOW()
       WHERE week_start_date = $1
       RETURNING *`,
      [weekStartDate, totalHours, JSON.stringify(events)]
    );
    return result.rows[0];
  }

  /**
   * Mark alert as sent
   */
  async markAlertSent(weekStartDate: string): Promise<void> {
    await pool.query(
      `UPDATE lyra_work_hours SET alert_sent_at = NOW(), updated_at = NOW()
       WHERE week_start_date = $1`,
      [weekStartDate]
    );
  }

  /**
   * Trigger the killswitch
   */
  async triggerKillswitch(weekStartDate: string): Promise<void> {
    await pool.query(
      `UPDATE lyra_work_hours SET killswitch_triggered_at = NOW(), updated_at = NOW()
       WHERE week_start_date = $1`,
      [weekStartDate]
    );
  }

  /**
   * Check if killswitch is active for current week
   */
  async isKillswitchActive(): Promise<boolean> {
    const weekStart = this.getWeekStart();
    const dateStr = weekStart.toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT killswitch_triggered_at FROM lyra_work_hours
       WHERE week_start_date = $1 AND killswitch_triggered_at IS NOT NULL`,
      [dateStr]
    );
    return result.rows.length > 0;
  }

  /**
   * Get current week's hours
   */
  async getCurrentWeekHours(): Promise<number> {
    const week = await this.getOrCreateWeek();
    return Number(week.total_hours);
  }

  /**
   * Check if alert was already sent this week
   */
  async wasAlertSent(): Promise<boolean> {
    const weekStart = this.getWeekStart();
    const dateStr = weekStart.toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT alert_sent_at FROM lyra_work_hours
       WHERE week_start_date = $1 AND alert_sent_at IS NOT NULL`,
      [dateStr]
    );
    return result.rows.length > 0;
  }

  /**
   * Reset for new week (clear killswitch and alert)
   */
  async resetWeek(weekStartDate: string): Promise<void> {
    await pool.query(
      `UPDATE lyra_work_hours
       SET killswitch_triggered_at = NULL, alert_sent_at = NULL, updated_at = NOW()
       WHERE week_start_date = $1`,
      [weekStartDate]
    );
  }
}

export const lyraWorkHoursRepository = new LyraWorkHoursRepository();
