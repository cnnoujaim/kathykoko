import { Request, Response } from 'express';
import crypto from 'crypto';
import { taskRepository } from '../repositories/task.repository';
import { calendarEventRepository } from '../repositories/calendar-event.repository';
import { messageRepository } from '../repositories/message.repository';
import { killswitchService } from '../services/killswitch/killswitch.service';
import { chatProcessingService } from '../services/chat/chat-processing.service';
import { pool } from '../config/database';

class DashboardController {
  async chat(req: Request, res: Response): Promise<void> {
    try {
      const { message } = req.body;
      const userId = req.user!.userId;
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const messageSid = `web-${crypto.randomUUID()}`;

      // Fetch recent conversation history before saving current message
      const recentMessages = await messageRepository.listRecent(20, userId);
      const history = recentMessages
        .reverse()
        .filter((m: { body: string | null }) => m.body)
        .map((m: { direction: string; body: string | null }) => ({
          role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.body!,
        }));

      await messageRepository.create({
        message_sid: messageSid,
        direction: 'inbound',
        from_number: 'web-dashboard',
        to_number: 'kathy',
        body: message,
        status: 'received',
        user_id: userId,
      });

      const { response, messageType } = await chatProcessingService.processMessage(message, messageSid, userId, history);

      await messageRepository.create({
        message_sid: `web-reply-${crypto.randomUUID()}`,
        direction: 'outbound',
        from_number: 'kathy',
        to_number: 'web-dashboard',
        body: response,
        status: 'processed',
        user_id: userId,
      });

      await messageRepository.updateStatus(messageSid, 'processed');

      res.json({ response, messageType, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  }

  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const [pendingTasks, activeTasks, killswitch, recentMessages, accounts] = await Promise.all([
        taskRepository.listByStatus('pending', 50, userId),
        taskRepository.listByStatus('active', 50, userId),
        killswitchService.getStatus(userId).catch(() => null),
        messageRepository.listRecent(20, userId),
        pool.query(
          `SELECT ua.id, ua.account_type FROM user_accounts ua
           JOIN oauth_tokens ot ON ua.id = ot.account_id
           WHERE ua.user_id = $1 AND ot.provider = 'google'`,
          [userId]
        ),
      ]);

      let calendarEvents: any[] = [];
      for (const account of accounts.rows) {
        try {
          const events = await calendarEventRepository.findInRange(account.id, now, weekFromNow);
          calendarEvents.push(...events);
        } catch { /* skip */ }
      }

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

  async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { status, category } = req.query;
      const limit = parseInt(req.query.limit as string) || 100;

      let tasks;
      if (status && typeof status === 'string') {
        tasks = await taskRepository.listByStatus(status as any, limit, userId);
      } else if (category && typeof category === 'string') {
        tasks = await taskRepository.listByCategory(category as string, limit, userId);
      } else {
        const [pending, active, completedToday, deferred] = await Promise.all([
          taskRepository.listByStatus('pending', limit, userId),
          taskRepository.listByStatus('active', limit, userId),
          taskRepository.listCompletedToday(limit, userId),
          taskRepository.listByStatus('deferred', limit, userId),
        ]);
        tasks = [...pending, ...active, ...deferred, ...completedToday];
      }

      res.json({ tasks });
    } catch (error) {
      console.error('Tasks error:', error);
      res.status(500).json({ error: 'Failed to load tasks' });
    }
  }

  async updateTaskStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { status } = req.body;

      if (!['pending', 'active', 'completed', 'deferred'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }

      const completedAt = status === 'completed' ? new Date() : undefined;
      const task = await taskRepository.updateStatus(id, status, completedAt, userId);

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

  async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { priority, due_date, category } = req.body;

      // Verify task belongs to user
      const task = await taskRepository.findById(id, userId);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      if (priority !== undefined) {
        if (!['urgent', 'high', 'medium', 'low'].includes(priority)) {
          res.status(400).json({ error: 'Invalid priority' });
          return;
        }
        await taskRepository.updatePriority(id, priority);
      }

      if (due_date !== undefined) {
        await taskRepository.updateDueDate(id, due_date ? new Date(due_date) : null);
      }

      if (category !== undefined) {
        await taskRepository.updateCategory(id, category);
      }

      const updated = await taskRepository.findById(id, userId);
      res.json({ task: updated });
    } catch (error) {
      console.error('Update task error:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  }

  async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const deleted = await taskRepository.delete(id, userId);

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

  async getCalendar(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const days = parseInt(req.query.days as string) || 7;
      const start = req.query.start ? new Date(req.query.start as string) : new Date();
      const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

      const accounts = await pool.query(
        `SELECT ua.id, ua.account_type FROM user_accounts ua
         JOIN oauth_tokens ot ON ua.id = ot.account_id
         WHERE ua.user_id = $1 AND ot.provider = 'google'`,
        [userId]
      );

      let events: any[] = [];
      for (const account of accounts.rows) {
        try {
          const accountEvents = await calendarEventRepository.findInRange(account.id, start, end);
          events.push(...accountEvents.map(e => ({ ...e, account_type: account.account_type })));
        } catch { /* skip */ }
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

  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const limit = parseInt(req.query.limit as string) || 50;
      const messages = await messageRepository.listRecent(limit, userId);
      res.json({ messages });
    } catch (error) {
      console.error('Messages error:', error);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  }

  async getEmailTodos(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await pool.query(
        `SELECT id, parsed_title, description, category, priority, status, due_date, created_at
         FROM tasks
         WHERE created_from_message_sid LIKE 'email-%'
         AND user_id = $2
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit, userId]
      );
      res.json({ todos: result.rows });
    } catch (error) {
      console.error('Email todos error:', error);
      res.status(500).json({ error: 'Failed to load email todos' });
    }
  }

  async updateAccountPhone(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { phone_number } = req.body;

      if (phone_number !== null && phone_number !== undefined && typeof phone_number !== 'string') {
        res.status(400).json({ error: 'Invalid phone number' });
        return;
      }

      const phone = phone_number ? phone_number.trim() : null;

      // Verify account belongs to user
      const account = await pool.query(
        'SELECT id FROM user_accounts WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      if (account.rows.length === 0) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      await pool.query(
        'UPDATE user_accounts SET phone_number = $1, updated_at = NOW() WHERE id = $2',
        [phone, id]
      );

      // Also update users.phone_number with the primary account's phone for backward compat
      const primary = await pool.query(
        'SELECT phone_number FROM user_accounts WHERE user_id = $1 AND is_primary = true',
        [userId]
      );
      if (primary.rows.length > 0) {
        await pool.query(
          'UPDATE users SET phone_number = $1, updated_at = NOW() WHERE id = $2',
          [primary.rows[0].phone_number, userId]
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Update account phone error:', error);
      res.status(500).json({ error: 'Failed to update phone number' });
    }
  }

  async getKillswitch(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const status = await killswitchService.getStatus(userId);
      res.json(status);
    } catch (error) {
      console.error('Killswitch error:', error);
      res.status(500).json({ error: 'Failed to load killswitch status' });
    }
  }
}

export const dashboardController = new DashboardController();
