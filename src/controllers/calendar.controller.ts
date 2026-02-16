import { Request, Response } from 'express';
import { calendarService } from '../services/calendar/calendar.service';

/**
 * Calendar controller for manual calendar operations
 * Provides endpoints for sync, conflict checking, and auto-blocking
 */
export class CalendarController {
  /**
   * Manually trigger calendar sync
   * POST /calendar/sync/:account_id
   */
  async sync(req: Request, res: Response): Promise<void> {
    try {
      const { account_id } = req.params;

      await calendarService.syncEvents(account_id);

      res.json({ message: 'Calendar sync completed successfully' });
    } catch (error) {
      console.error('Calendar sync error:', error);
      res.status(500).json({ error: 'Failed to sync calendar' });
    }
  }

  /**
   * Check for conflicts in a time range
   * GET /calendar/conflicts/:account_id?start=...&end=...
   */
  async checkConflicts(req: Request, res: Response): Promise<void> {
    try {
      const { account_id } = req.params;
      const { start, end } = req.query;

      if (!start || !end) {
        res.status(400).json({ error: 'Missing start or end time' });
        return;
      }

      const startTime = new Date(start as string);
      const endTime = new Date(end as string);

      const conflicts = await calendarService.checkConflicts(account_id, startTime, endTime);

      res.json(conflicts);
    } catch (error) {
      console.error('Calendar conflicts error:', error);
      res.status(500).json({ error: 'Failed to check conflicts' });
    }
  }

  /**
   * Manually trigger studio time auto-blocking
   * POST /calendar/auto-block/:account_id
   */
  async autoBlockStudio(req: Request, res: Response): Promise<void> {
    try {
      const { account_id } = req.params;
      const { hours = 8 } = req.body;

      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      // Set to start of week (Monday)
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
      weekStart.setDate(diff);

      await calendarService.autoBlockStudioTime(account_id, weekStart, hours);

      res.json({ message: `Studio time auto-blocked for ${hours} hours` });
    } catch (error) {
      console.error('Auto-block studio time error:', error);
      res.status(500).json({ error: 'Failed to auto-block studio time' });
    }
  }
}

export const calendarController = new CalendarController();
