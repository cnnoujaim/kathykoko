import { pool } from '../config/database';
import { CalendarEvent, CreateCalendarEventInput } from '../types/calendar.types';

/**
 * Repository for calendar events (local cache of Google Calendar)
 * Enables fast conflict detection without API calls
 */
export class CalendarEventRepository {
  /**
   * Create or update calendar event from Google sync
   * Uses ON CONFLICT to handle updates
   */
  async upsert(input: CreateCalendarEventInput): Promise<CalendarEvent> {
    const {
      google_event_id,
      account_id,
      calendar_id,
      title,
      description,
      start_time,
      end_time,
      location,
      event_type = 'personal',
      is_auto_blocked = false,
      attendees,
      recurring_rule,
      task_id,
    } = input;

    const result = await pool.query(
      `INSERT INTO calendar_events (
        google_event_id, account_id, calendar_id, title, description,
        start_time, end_time, location, event_type, is_auto_blocked,
        attendees, recurring_rule, task_id, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (google_event_id)
      DO UPDATE SET
        title = $4,
        description = $5,
        start_time = $6,
        end_time = $7,
        location = $8,
        event_type = $9,
        attendees = $11,
        recurring_rule = $12,
        task_id = $13,
        synced_at = NOW(),
        updated_at = NOW()
      RETURNING *`,
      [
        google_event_id,
        account_id,
        calendar_id,
        title,
        description,
        start_time,
        end_time,
        location,
        event_type,
        is_auto_blocked,
        attendees,
        recurring_rule,
        task_id,
      ]
    );

    return result.rows[0];
  }

  /**
   * Find events in a time range (for conflict detection)
   * Returns events that overlap with the given range
   */
  async findInRange(
    accountId: string,
    startTime: Date,
    endTime: Date
  ): Promise<CalendarEvent[]> {
    const result = await pool.query(
      `SELECT * FROM calendar_events
       WHERE account_id = $1
       AND start_time < $3
       AND end_time > $2
       ORDER BY start_time ASC`,
      [accountId, startTime, endTime]
    );
    return result.rows;
  }

  /**
   * Find events in a time range across multiple accounts (for cross-account conflict detection)
   */
  async findInRangeMultiAccount(
    accountIds: string[],
    startTime: Date,
    endTime: Date
  ): Promise<CalendarEvent[]> {
    if (accountIds.length === 0) return [];
    const result = await pool.query(
      `SELECT * FROM calendar_events
       WHERE account_id = ANY($1)
       AND start_time < $3
       AND end_time > $2
       ORDER BY start_time ASC`,
      [accountIds, startTime, endTime]
    );
    return result.rows;
  }

  /**
   * Get all events across multiple accounts in a date range (for slot finding)
   */
  async findAllInRangeMultiAccount(
    accountIds: string[],
    startTime: Date,
    endTime: Date
  ): Promise<CalendarEvent[]> {
    if (accountIds.length === 0) return [];
    const result = await pool.query(
      `SELECT * FROM calendar_events
       WHERE account_id = ANY($1)
       AND start_time < $3
       AND end_time > $2
       ORDER BY start_time ASC`,
      [accountIds, startTime, endTime]
    );
    return result.rows;
  }

  /**
   * Find event by Google event ID
   */
  async findByGoogleEventId(googleEventId: string): Promise<CalendarEvent | null> {
    const result = await pool.query(
      'SELECT * FROM calendar_events WHERE google_event_id = $1',
      [googleEventId]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete event (when deleted from Google Calendar)
   */
  async deleteByGoogleEventId(googleEventId: string): Promise<void> {
    await pool.query(
      'DELETE FROM calendar_events WHERE google_event_id = $1',
      [googleEventId]
    );
  }

  /**
   * Delete local events that no longer exist on Google Calendar.
   * Removes events in the given time range whose google_event_id is NOT in the provided set.
   */
  async deleteStaleEvents(
    accountId: string,
    startTime: Date,
    endTime: Date,
    activeGoogleEventIds: string[]
  ): Promise<number> {
    if (activeGoogleEventIds.length === 0) {
      // If Google returned zero events, delete all local events in range
      const result = await pool.query(
        `DELETE FROM calendar_events
         WHERE account_id = $1
         AND start_time >= $2 AND start_time <= $3`,
        [accountId, startTime, endTime]
      );
      return result.rowCount ?? 0;
    }

    const placeholders = activeGoogleEventIds.map((_, i) => `$${i + 4}`).join(', ');
    const result = await pool.query(
      `DELETE FROM calendar_events
       WHERE account_id = $1
       AND start_time >= $2 AND start_time <= $3
       AND google_event_id NOT IN (${placeholders})`,
      [accountId, startTime, endTime, ...activeGoogleEventIds]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Get all auto-blocked events in a date range
   * Used for tracking studio time, workout blocks, etc.
   */
  async getAutoBlockedEvents(
    accountId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CalendarEvent[]> {
    const result = await pool.query(
      `SELECT * FROM calendar_events
       WHERE account_id = $1
       AND is_auto_blocked = true
       AND start_time >= $2
       AND end_time <= $3
       ORDER BY start_time ASC`,
      [accountId, startDate, endDate]
    );
    return result.rows;
  }

  /**
   * Search events by title (fuzzy ILIKE match) across all accounts
   */
  async findByTitleLike(search: string, startDate?: Date, endDate?: Date, limit: number = 5): Promise<CalendarEvent[]> {
    let query = `SELECT * FROM calendar_events WHERE title ILIKE $1`;
    const params: any[] = [`%${search}%`];

    if (startDate) {
      params.push(startDate);
      query += ` AND start_time >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND end_time <= $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY start_time ASC LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get all events for an account
   */
  async findByAccountId(accountId: string): Promise<CalendarEvent[]> {
    const result = await pool.query(
      `SELECT * FROM calendar_events
       WHERE account_id = $1
       ORDER BY start_time ASC`,
      [accountId]
    );
    return result.rows;
  }
}

export const calendarEventRepository = new CalendarEventRepository();
