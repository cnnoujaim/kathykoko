import { claudeService } from '../ai/claude.service';
import { taskRepository } from '../../repositories/task.repository';
import { calendarEventRepository } from '../../repositories/calendar-event.repository';
import { calendarService } from '../calendar/calendar.service';
import { oauthService } from '../oauth/oauth.service';
import { pool } from '../../config/database';

type ActionType =
  | 'complete_task'
  | 'delete_task'
  | 'edit_task'
  | 'reprioritize_task'
  | 'recategorize_task'
  | 'update_hours'
  | 'cancel_event'
  | 'reschedule_event'
  | 'create_event';

interface ParsedAction {
  type: ActionType;
  target: string;
  new_value?: string;
  new_date?: string;
  new_time?: string;
  new_priority?: string;
  new_category?: string;
  duration_hours?: number;
}

/**
 * Handles task and calendar management commands via SMS.
 * Uses Claude to parse natural language into structured actions, then executes them.
 */
export class ActionService {
  /**
   * Parse and execute an SMS management command
   */
  async execute(body: string): Promise<string> {
    // 1. Parse the command with Claude
    const action = await this.parseAction(body);
    if (!action) {
      return "I couldn't understand that command. Try something like: \"mark [task] as done\", \"delete [task]\", \"cancel [event]\", or \"reschedule [event] to Friday at 3pm\".";
    }

    // 2. Execute based on action type
    switch (action.type) {
      case 'complete_task':
        return this.completeTask(action.target);
      case 'delete_task':
        return this.deleteTask(action.target);
      case 'edit_task':
        return this.editTask(action.target, action.new_value || '');
      case 'reprioritize_task':
        return this.reprioritizeTask(action.target, action.new_priority || 'medium');
      case 'recategorize_task':
        return this.recategorizeTask(action.target, action.new_category || '');
      case 'update_hours':
        return this.updateHours(action.target, action.duration_hours || 0);
      case 'cancel_event':
        return this.cancelEvent(action.target);
      case 'reschedule_event':
        return this.rescheduleEvent(action.target, action.new_date || '', action.new_time || '');
      case 'create_event':
        return this.createEvent(action.target, action.new_date || '', action.new_time || '', action.duration_hours);
      default:
        return "I couldn't process that action. Can you rephrase?";
    }
  }

  private async parseAction(body: string): Promise<ParsedAction | null> {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });

    const prompt = `Parse this SMS into a management action. TODAY is ${currentDay}, ${currentDate}.

SMS: "${body}"

Return JSON with:
{
  "type": one of: "complete_task", "delete_task", "edit_task", "reprioritize_task", "recategorize_task", "update_hours", "cancel_event", "reschedule_event", "create_event"
  "target": the name/description of the task or event being referenced (use the most identifying keywords),
  "new_value": (for edit_task) the new title/description,
  "new_date": (for reschedule/create) ISO date string YYYY-MM-DD,
  "new_time": (for reschedule/create) time in HH:MM 24hr format,
  "new_priority": (for reprioritize) one of "urgent", "high", "medium", "low",
  "new_category": (for recategorize_task) one of "lyra", "music", "personal", "house",
  "duration_hours": (for update_hours or create_event) number of hours
}

Only include fields that are relevant. Return JSON only.`;

    try {
      return await claudeService.completeJSON<ParsedAction>(
        prompt,
        'You parse SMS management commands into structured JSON actions. Return valid JSON only.',
        256
      );
    } catch {
      return null;
    }
  }

  private async completeTask(target: string): Promise<string> {
    const tasks = await taskRepository.findByTitleLike(target);
    if (tasks.length === 0) {
      return `Couldn't find a task matching "${target}". Check your task list and try again.`;
    }

    const task = tasks[0];
    if (task.status === 'completed') {
      return `"${task.parsed_title}" is already marked as done.`;
    }

    await taskRepository.updateStatus(task.id, 'completed', new Date());
    return `Done! Marked "${task.parsed_title}" as complete.`;
  }

  private async deleteTask(target: string): Promise<string> {
    const tasks = await taskRepository.findByTitleLike(target);
    if (tasks.length === 0) {
      return `Couldn't find a task matching "${target}".`;
    }

    const task = tasks[0];
    await taskRepository.delete(task.id);
    return `Deleted "${task.parsed_title}" from your tasks.`;
  }

  private async editTask(target: string, newValue: string): Promise<string> {
    if (!newValue) {
      return `What should I change the task to? Try: "edit [task name] to [new name]"`;
    }

    const tasks = await taskRepository.findByTitleLike(target);
    if (tasks.length === 0) {
      return `Couldn't find a task matching "${target}".`;
    }

    const task = tasks[0];
    await taskRepository.updateTitle(task.id, newValue);
    return `Updated "${task.parsed_title}" → "${newValue}"`;
  }

  private async reprioritizeTask(target: string, priority: string): Promise<string> {
    const validPriorities = ['urgent', 'high', 'medium', 'low'];
    if (!validPriorities.includes(priority)) {
      return `Invalid priority. Use: urgent, high, medium, or low.`;
    }

    const tasks = await taskRepository.findByTitleLike(target);
    if (tasks.length === 0) {
      return `Couldn't find a task matching "${target}".`;
    }

    const task = tasks[0];
    await taskRepository.updatePriority(task.id, priority as any);
    return `Changed "${task.parsed_title}" priority to ${priority}.`;
  }

  private async recategorizeTask(target: string, category: string): Promise<string> {
    const validCategories = ['lyra', 'music', 'personal', 'house'];
    if (!validCategories.includes(category)) {
      return `Invalid category. Use: lyra, music, personal, or house.`;
    }

    const tasks = await taskRepository.findByTitleLike(target);
    if (tasks.length === 0) {
      return `Couldn't find a task matching "${target}".`;
    }

    const task = tasks[0];
    await taskRepository.updateCategory(task.id, category as any);
    return `Moved "${task.parsed_title}" to ${category} category.`;
  }

  private async updateHours(target: string, hours: number): Promise<string> {
    if (!hours || hours <= 0) {
      return `How many hours? Try: "change [task] to 3 hours"`;
    }

    const tasks = await taskRepository.findByTitleLike(target);
    if (tasks.length === 0) {
      return `Couldn't find a task matching "${target}".`;
    }

    const task = tasks[0];
    await taskRepository.updateEstimatedHours(task.id, hours);
    return `Updated "${task.parsed_title}" to ${hours} hour(s).`;
  }

  private async cancelEvent(target: string): Promise<string> {
    const events = await calendarEventRepository.findByTitleLike(target, new Date());
    if (events.length === 0) {
      return `Couldn't find an upcoming event matching "${target}".`;
    }

    const event = events[0];
    try {
      await calendarService.deleteEvent(event.account_id, event.google_event_id);
      const dateStr = new Date(event.start_time).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York'
      });
      return `Cancelled "${event.title}" on ${dateStr}.`;
    } catch {
      return `Found "${event.title}" but couldn't delete it from Google Calendar. It may have been already removed.`;
    }
  }

  private async rescheduleEvent(target: string, newDate: string, newTime: string): Promise<string> {
    if (!newDate) {
      return `When should I reschedule it to? Try: "reschedule [event] to Friday at 3pm"`;
    }

    const events = await calendarEventRepository.findByTitleLike(target, new Date());
    if (events.length === 0) {
      return `Couldn't find an upcoming event matching "${target}".`;
    }

    const event = events[0];
    const duration = new Date(event.end_time).getTime() - new Date(event.start_time).getTime();

    // Build new start time
    const newStart = new Date(newDate);
    if (newTime) {
      const [hours, minutes] = newTime.split(':').map(Number);
      newStart.setHours(hours, minutes, 0, 0);
    } else {
      // Keep original time of day
      const origStart = new Date(event.start_time);
      newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
    }
    const newEnd = new Date(newStart.getTime() + duration);

    try {
      await calendarService.updateEvent(event.account_id, event.google_event_id, {
        startTime: newStart,
        endTime: newEnd,
      });
      const dateStr = newStart.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York'
      });
      const timeStr = newStart.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
      });
      return `Rescheduled "${event.title}" to ${dateStr} at ${timeStr}.`;
    } catch {
      return `Found "${event.title}" but couldn't update it on Google Calendar.`;
    }
  }

  private async createEvent(title: string, date: string, time: string, durationHours?: number): Promise<string> {
    if (!date) {
      return `When should I schedule it? Try: "add meeting Wednesday at 2pm"`;
    }

    const duration = durationHours || 1;
    const startTime = new Date(date);
    if (time) {
      const [hours, minutes] = time.split(':').map(Number);
      startTime.setHours(hours, minutes, 0, 0);
    } else {
      startTime.setHours(9, 0, 0, 0); // Default 9am
    }
    const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);

    // Find primary account
    const accountResult = await pool.query(
      `SELECT ua.id FROM user_accounts ua
       JOIN oauth_tokens ot ON ua.id = ot.account_id
       WHERE ua.is_primary = true AND ot.provider = 'google'
       LIMIT 1`
    );

    if (accountResult.rows.length === 0) {
      return `No connected Google account found. Connect one first via /oauth/connect.`;
    }

    const accountId = accountResult.rows[0].id;

    try {
      await calendarService.createEventFromTask(
        accountId,
        '', // no task_id
        title,
        startTime,
        endTime,
        'Created via Kathy Koko SMS'
      );

      const dateStr = startTime.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York'
      });
      const timeStr = startTime.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
      });
      return `Added "${title}" to your calendar: ${dateStr} at ${timeStr} (${duration}hr).`;
    } catch {
      return `Couldn't create the event on Google Calendar. Try again later.`;
    }
  }
}

export const actionService = new ActionService();
