import { claudeService } from './claude.service';
import { pool } from '../../config/database';
import { killswitchService } from '../killswitch/killswitch.service';

/**
 * Handles natural language questions about calendar, tasks, and schedule.
 * Gathers relevant context and uses Claude to generate a conversational response.
 */
export class QueryService {
  /**
   * Answer a natural language question using calendar + task context
   */
  async answer(question: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []): Promise<string> {
    const now = new Date();
    const currentDateTime = now.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    // Gather context in parallel
    const [upcomingEvents, pendingTasks, killswitchStatus, recentEmails] = await Promise.all([
      this.getUpcomingEvents(),
      this.getPendingTasks(),
      killswitchService.getStatus(),
      this.getRecentEmails(),
    ]);

    const systemPrompt = `You are Kathy Koko, a sharp personal assistant for a musician/software engineer.
You answer questions about her schedule, tasks, calendar, and emails concisely via SMS.
Keep responses under 300 characters when possible. Be direct, warm, and practical.
Use simple formatting (no markdown). You can use emojis sparingly.`;

    const prompt = `CURRENT DATE/TIME: ${currentDateTime} (Pacific Time)

CALENDAR (next 7 days):
${upcomingEvents || 'No upcoming events.'}

PENDING TASKS:
${pendingTasks || 'No pending tasks.'}

RECENT EMAILS (needing attention):
${recentEmails || 'No urgent emails.'}

LYRA WORK HOURS: ${killswitchStatus.currentHours}/40 this week${killswitchStatus.isActive ? ' (KILLSWITCH ACTIVE)' : ` (${killswitchStatus.remainingHours} remaining)`}

USER QUESTION: "${question}"

Answer the question based on the context above. Be concise (SMS format). If you don't have enough info, say so honestly.`;

    // Use multi-turn chat if we have conversation history
    if (history.length > 0) {
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        ...history.slice(-10),
        { role: 'user' as const, content: prompt },
      ];
      return await claudeService.chat(messages, systemPrompt, 512);
    }

    return await claudeService.complete(prompt, systemPrompt, 512);
  }

  private async getUpcomingEvents(): Promise<string> {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const result = await pool.query(
      `SELECT ce.title, ce.start_time, ce.end_time, ce.location, ce.event_type, ua.account_type
       FROM calendar_events ce
       JOIN user_accounts ua ON ce.account_id = ua.id
       WHERE ce.start_time >= $1 AND ce.start_time < $2
       ORDER BY ce.start_time ASC
       LIMIT 30`,
      [now, weekFromNow]
    );

    if (result.rows.length === 0) return '';

    return result.rows.map((e: any) => {
      const start = new Date(e.start_time);
      const end = new Date(e.end_time);
      const day = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
      const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
      const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
      const loc = e.location ? ` @ ${e.location}` : '';
      return `- ${day} ${startTime}-${endTime}: ${e.title} [${e.account_type}]${loc}`;
    }).join('\n');
  }

  private async getPendingTasks(): Promise<string> {
    const result = await pool.query(
      `SELECT parsed_title, category, priority, due_date, estimated_hours, status
       FROM tasks
       WHERE status IN ('pending', 'active', 'clarification_needed', 'deferred')
       ORDER BY
         CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
         due_date ASC NULLS LAST
       LIMIT 15`
    );

    if (result.rows.length === 0) return '';

    return result.rows.map((t: any) => {
      const due = t.due_date ? ` (due ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })})` : '';
      const hours = t.estimated_hours ? ` ~${t.estimated_hours}h` : '';
      return `- [${t.priority}] ${t.parsed_title} [${t.category}]${due}${hours} - ${t.status}`;
    }).join('\n');
  }
  private async getRecentEmails(): Promise<string> {
    const result = await pool.query(
      `SELECT e.from_address, e.subject, e.snippet, e.is_urgent, e.has_draft, e.is_read, ua.account_type,
              ed.persona as draft_persona, ed.status as draft_status
       FROM emails e
       JOIN user_accounts ua ON e.account_id = ua.id
       LEFT JOIN email_drafts ed ON e.draft_id = ed.id
       WHERE e.received_at >= NOW() - INTERVAL '3 days'
       ORDER BY e.is_urgent DESC, e.received_at DESC
       LIMIT 10`
    );

    if (result.rows.length === 0) return '';

    return result.rows.map((e: any) => {
      const urgent = e.is_urgent ? '🔴 ' : '';
      const draft = e.has_draft ? ` [draft: ${e.draft_status}]` : '';
      const read = e.is_read ? '' : ' (unread)';
      return `${urgent}- From: ${e.from_address} | "${e.subject}" [${e.account_type}]${read}${draft}`;
    }).join('\n');
  }
}

export const queryService = new QueryService();
