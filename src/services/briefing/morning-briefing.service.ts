import { pool } from '../../config/database';
import { config } from '../../config';
import { smsService } from '../sms/sms.service';
import { killswitchService } from '../killswitch/killswitch.service';

/**
 * Generates and sends the 7:30 AM morning briefing via SMS.
 * Covers: today's calendar, pending tasks, Lyra hours, urgent emails, and a vibe check prompt.
 */
export class MorningBriefingService {
  async sendBriefing(): Promise<void> {
    const briefing = await this.generateBriefing();
    await smsService.sendSMS(config.kathyPhoneNumber, briefing);
    console.log('✓ Morning briefing sent');
  }

  async generateBriefing(): Promise<string> {
    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Los_Angeles' });
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' });

    const [todayEvents, urgentTasks, killswitch, urgentEmails, pendingDrafts] = await Promise.all([
      this.getTodayEvents(),
      this.getUrgentTasks(),
      killswitchService.getStatus(),
      this.getUrgentEmails(),
      this.getPendingDrafts(),
    ]);

    const parts: string[] = [];

    // Header
    parts.push(`Good morning! Here's your ${dayName}, ${dateStr} briefing:`);

    // Calendar
    if (todayEvents.length > 0) {
      parts.push('');
      parts.push(`CALENDAR (${todayEvents.length} events):`);
      for (const e of todayEvents) {
        const start = new Date(e.start_time);
        const time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
        const tag = e.account_type === 'lyra' ? '[Lyra]' : e.account_type === 'music' ? '[Music]' : '';
        const loc = e.location ? ` @ ${e.location}` : '';
        parts.push(`  ${time} - ${e.title} ${tag}${loc}`);
      }
    } else {
      parts.push('');
      parts.push('CALENDAR: Clear day - no events scheduled.');
    }

    // Lyra hours
    parts.push('');
    if (killswitch.isActive) {
      parts.push(`LYRA: KILLSWITCH ACTIVE (${killswitch.currentHours}/40 hrs). No new Lyra work.`);
    } else {
      parts.push(`LYRA: ${killswitch.currentHours}/40 hrs this week (${killswitch.remainingHours} remaining)`);
    }

    // Urgent tasks
    if (urgentTasks.length > 0) {
      parts.push('');
      parts.push(`TASKS (${urgentTasks.length} priority):`);
      for (const t of urgentTasks.slice(0, 5)) {
        const due = t.due_date
          ? ` (due ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })})`
          : '';
        parts.push(`  [${t.priority}] ${t.parsed_title}${due}`);
      }
    }

    // Urgent emails
    if (urgentEmails.length > 0) {
      parts.push('');
      parts.push(`EMAILS (${urgentEmails.length} need attention):`);
      for (const e of urgentEmails.slice(0, 3)) {
        const draft = e.has_draft ? ' [draft ready]' : '';
        parts.push(`  From: ${e.from_address} - "${e.subject}"${draft}`);
      }
    }

    // Pending drafts
    if (pendingDrafts > 0) {
      parts.push('');
      parts.push(`${pendingDrafts} email draft(s) waiting for your approval.`);
    }

    // Vibe check
    parts.push('');
    parts.push(`What's in your head that I don't know about yet?`);

    return parts.join('\n');
  }

  private async getTodayEvents(): Promise<any[]> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await pool.query(
      `SELECT ce.title, ce.start_time, ce.end_time, ce.location, ce.event_type, ua.account_type
       FROM calendar_events ce
       JOIN user_accounts ua ON ce.account_id = ua.id
       WHERE ce.start_time >= $1 AND ce.start_time <= $2
       ORDER BY ce.start_time ASC`,
      [startOfDay, endOfDay]
    );
    return result.rows;
  }

  private async getUrgentTasks(): Promise<any[]> {
    const result = await pool.query(
      `SELECT parsed_title, category, priority, due_date, status
       FROM tasks
       WHERE status IN ('pending', 'active', 'clarification_needed')
         AND priority IN ('urgent', 'high')
       ORDER BY
         CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
         due_date ASC NULLS LAST
       LIMIT 8`
    );
    return result.rows;
  }

  private async getUrgentEmails(): Promise<any[]> {
    const result = await pool.query(
      `SELECT e.from_address, e.subject, e.has_draft
       FROM emails e
       WHERE e.is_urgent = true AND e.is_read = false
       ORDER BY e.received_at DESC
       LIMIT 5`
    );
    return result.rows;
  }

  private async getPendingDrafts(): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM email_drafts WHERE status = 'draft'`
    );
    return parseInt(result.rows[0].count, 10);
  }
}

export const morningBriefingService = new MorningBriefingService();
