import { pool } from '../../config/database';
import { config } from '../../config';
import { smsService } from '../sms/sms.service';
import { healthCheckinRepository } from '../../repositories/health-checkin.repository';
import { claudeService } from '../ai/claude.service';

/**
 * Generates and sends the 8 PM evening check-in via SMS.
 * Prompts for health/wellness tracking and captures the response.
 */
export class EveningCheckinService {
  async sendCheckin(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // Don't send duplicate check-ins
    const existing = await healthCheckinRepository.findTodayByType('vibe');
    if (existing) {
      console.log('Evening check-in already sent today, skipping');
      return;
    }

    const message = await this.generateCheckinPrompt();

    // Record that we sent the prompt
    await healthCheckinRepository.create({
      checkin_date: today,
      checkin_type: 'vibe',
      prompt_sent_at: new Date(),
    });

    await smsService.sendSMS(config.kathyPhoneNumber, message);
    console.log('✓ Evening check-in sent');
  }

  async generateCheckinPrompt(): Promise<string> {
    const todaySummary = await this.getTodaySummary();

    const parts: string[] = [];

    parts.push(`Evening check-in!`);

    if (todaySummary.completedTasks > 0) {
      parts.push(`You knocked out ${todaySummary.completedTasks} task(s) today.`);
    }

    if (todaySummary.eventCount > 0) {
      parts.push(`${todaySummary.eventCount} events on the books today.`);
    }

    parts.push('');
    parts.push('Quick check:');
    parts.push('1. 0mg tonight?');
    parts.push('2. Did you drink water + rest the vocals?');
    parts.push('3. Any wins or milestones today?');
    parts.push('');
    parts.push('Reply with whatever is on your mind.');

    return parts.join('\n');
  }

  /**
   * Process an evening check-in response from the user
   */
  async processResponse(responseText: string): Promise<string> {
    const pending = await healthCheckinRepository.findPendingResponse();
    if (!pending) {
      return "No pending check-in to respond to.";
    }

    // Use Claude to parse the check-in response
    const parsedData = await this.parseCheckinResponse(responseText);

    await healthCheckinRepository.recordResponse(pending.id, responseText, parsedData);

    // Generate acknowledgment
    const ack = this.generateAcknowledgment(parsedData);
    return ack;
  }

  private async parseCheckinResponse(response: string): Promise<any> {
    const prompt = `Parse this evening check-in response. Extract:
- edibles: did they mention 0mg/no edibles? (boolean or null if not mentioned)
- hydration: did they drink water? (boolean or null)
- vocal_rest: are they resting vocals? (boolean or null)
- wins: any wins or milestones mentioned (string or null)
- mood: overall mood (positive/neutral/negative/stressed)
- notes: any other notable info

Response: "${response}"

Return JSON only, no explanation.`;

    const result = await claudeService.complete(prompt, 'You parse check-in responses into structured JSON. Return valid JSON only.', 256);

    try {
      return JSON.parse(result);
    } catch {
      return { raw: response, mood: 'neutral' };
    }
  }

  private generateAcknowledgment(parsed: any): string {
    const parts: string[] = [];

    if (parsed.wins) {
      parts.push(`Love that win: "${parsed.wins}"`);
    }

    if (parsed.edibles === true) {
      parts.push('Noted on the edibles.');
    } else if (parsed.edibles === false) {
      parts.push('0mg - nice.');
    }

    if (parsed.hydration === false) {
      parts.push('Drink some water before bed!');
    }

    if (parsed.mood === 'stressed') {
      parts.push('Take it easy tonight. Tomorrow is a new day.');
    }

    if (parts.length === 0) {
      parts.push('Got it. Rest up tonight.');
    }

    parts.push('Good night!');
    return parts.join(' ');
  }

  private async getTodaySummary(): Promise<{ completedTasks: number; eventCount: number }> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const [tasks, events] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as count FROM tasks
         WHERE status = 'completed' AND updated_at >= $1 AND updated_at <= $2`,
        [startOfDay, endOfDay]
      ),
      pool.query(
        `SELECT COUNT(*) as count FROM calendar_events
         WHERE start_time >= $1 AND start_time <= $2`,
        [startOfDay, endOfDay]
      ),
    ]);

    return {
      completedTasks: parseInt(tasks.rows[0].count, 10),
      eventCount: parseInt(events.rows[0].count, 10),
    };
  }
}

export const eveningCheckinService = new EveningCheckinService();
