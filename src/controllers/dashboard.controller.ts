import { Request, Response } from 'express';
import crypto from 'crypto';
import { taskRepository } from '../repositories/task.repository';
import { calendarEventRepository } from '../repositories/calendar-event.repository';
import { messageRepository } from '../repositories/message.repository';
import { killswitchService } from '../services/killswitch/killswitch.service';
import { chatProcessingService } from '../services/chat/chat-processing.service';
import { pool } from '../config/database';

class DashboardController {
  /**
   * POST /api/chat - Send a message to Kathy, get synchronous response
   */
  async chat(req: Request, res: Response): Promise<void> {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const messageSid = `web-${crypto.randomUUID()}`;

      // Store inbound message
      await messageRepository.create({
        message_sid: messageSid,
        direction: 'inbound',
        from_number: 'web-dashboard',
        to_number: 'kathy',
        body: message,
        status: 'received',
      });

      // Process through the full pipeline (synchronous for web)
      const { response, messageType } = await chatProcessingService.processMessage(message, messageSid);

      // Store outbound response
      await messageRepository.create({
        message_sid: `web-reply-${crypto.randomUUID()}`,
        direction: 'outbound',
        from_number: 'kathy',
        to_number: 'web-dashboard',
        body: response,
        status: 'processed',
      });

      // Mark inbound as processed
      await messageRepository.updateStatus(messageSid, 'processed');

      res.json({ response, messageType, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  }

  /**
   * GET /api/dashboard - Aggregated dashboard data
   */
  async getDashboard(_req: Request, res: Response): Promise<void> {
    try {
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Fetch all data in parallel
      const [pendingTasks, activeTasks, killswitch, recentMessages, accounts] = await Promise.all([
        taskRepository.listByStatus('pending', 50),
        taskRepository.listByStatus('active', 50),
        killswitchService.getStatus().catch(() => null),
        messageRepository.listRecent(20),
        pool.query(
          `SELECT ua.id, ua.account_type FROM user_accounts ua
           JOIN oauth_tokens ot ON ua.id = ot.account_id
           WHERE ot.provider = 'google'`
        ),
      ]);

      // Fetch calendar events for all connected accounts
      let calendarEvents: any[] = [];
      for (const account of accounts.rows) {
        try {
          const events = await calendarEventRepository.findInRange(
            account.id,
            now,
            weekFromNow
          );
          calendarEvents.push(...events);
        } catch {
          // Skip accounts with errors
        }
      }

      // Sort events by start time
      calendarEvents.sort((a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      res.json({
        tasks: { pending: pendingTasks, active: activeTasks },
        calendar: calendarEvents,
        killswitch,
        messages: recentMessages,
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  }

  /**
   * GET /api/tasks - List tasks with optional filters
   */
  async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const { status, category } = req.query;
      const limit = parseInt(req.query.limit as string) || 100;

      let tasks;
      if (status && typeof status === 'string') {
        tasks = await taskRepository.listByStatus(status as any, limit);
      } else if (category && typeof category === 'string') {
        tasks = await taskRepository.listByCategory(category as any, limit);
      } else {
        // Get all non-rejected tasks
        const [pending, active, completed, deferred] = await Promise.all([
          taskRepository.listByStatus('pending', limit),
          taskRepository.listByStatus('active', limit),
          taskRepository.listByStatus('completed', limit),
          taskRepository.listByStatus('deferred', limit),
        ]);
        tasks = [...pending, ...active, ...deferred, ...completed];
      }

      res.json({ tasks });
    } catch (error) {
      console.error('Tasks error:', error);
      res.status(500).json({ error: 'Failed to load tasks' });
    }
  }

  /**
   * PATCH /api/tasks/:id/status - Update task status
   */
  async updateTaskStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['pending', 'active', 'completed', 'deferred'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }

      const completedAt = status === 'completed' ? new Date() : undefined;
      const task = await taskRepository.updateStatus(id, status, completedAt);

      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      res.json({ task });
    } catch (error) {
      console.error('Update task error:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  }

  /**
   * DELETE /api/tasks/:id - Delete a task
   */
  async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await taskRepository.delete(id);

      if (!deleted) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Delete task error:', error);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  }

  /**
   * GET /api/calendar - Upcoming events
   */
  async getCalendar(req: Request, res: Response): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const now = new Date();
      const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      const accounts = await pool.query(
        `SELECT ua.id, ua.account_type FROM user_accounts ua
         JOIN oauth_tokens ot ON ua.id = ot.account_id
         WHERE ot.provider = 'google'`
      );

      let events: any[] = [];
      for (const account of accounts.rows) {
        try {
          const accountEvents = await calendarEventRepository.findInRange(
            account.id,
            now,
            end
          );
          events.push(...accountEvents.map(e => ({ ...e, account_type: account.account_type })));
        } catch {
          // Skip accounts with errors
        }
      }

      events.sort((a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      res.json({ events });
    } catch (error) {
      console.error('Calendar error:', error);
      res.status(500).json({ error: 'Failed to load calendar' });
    }
  }

  /**
   * GET /api/messages - Conversation history
   */
  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const messages = await messageRepository.listRecent(limit);
      res.json({ messages });
    } catch (error) {
      console.error('Messages error:', error);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  }

  /**
   * GET /api/email-todos - Tasks created from email scanning
   */
  async getEmailTodos(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await pool.query(
        `SELECT id, parsed_title, description, category, priority, status, due_date, created_at
         FROM tasks
         WHERE created_from_message_sid LIKE 'email-%'
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );
      res.json({ todos: result.rows });
    } catch (error) {
      console.error('Email todos error:', error);
      res.status(500).json({ error: 'Failed to load email todos' });
    }
  }

  /**
   * GET /api/killswitch - Killswitch status
   */
  async getKillswitch(_req: Request, res: Response): Promise<void> {
    try {
      const status = await killswitchService.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Killswitch error:', error);
      res.status(500).json({ error: 'Failed to load killswitch status' });
    }
  }
}

export const dashboardController = new DashboardController();
