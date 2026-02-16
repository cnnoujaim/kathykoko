import { pool } from '../../config/database';
import { lyraWorkHoursRepository } from '../../repositories/lyra-work-hours.repository';
import { calendarEventRepository } from '../../repositories/calendar-event.repository';
import { smsService } from '../sms/sms.service';
import { config } from '../../config';

const ALERT_THRESHOLD = 35; // Send alert at 35 hours
const KILLSWITCH_THRESHOLD = 40; // Block new Lyra work at 40 hours

interface KillswitchStatus {
  currentHours: number;
  remainingHours: number;
  isActive: boolean;
  alertSent: boolean;
  weekStartDate: string;
}

export class KillswitchService {
  /**
   * Calculate Lyra work hours from synced calendar events for the current week
   */
  async calculateWeeklyHours(): Promise<{ totalHours: number; events: any[] }> {
    const weekStart = lyraWorkHoursRepository.getWeekStart();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Get all "work" type events from calendar for this week across ALL accounts
    const result = await pool.query(
      `SELECT ce.title, ce.start_time, ce.end_time, ce.event_type, ua.account_type, ua.email
       FROM calendar_events ce
       JOIN user_accounts ua ON ce.account_id = ua.id
       WHERE ce.start_time >= $1
       AND ce.start_time < $2
       AND (
         ce.event_type = 'work'
         OR ce.title ILIKE '%lyra%'
         OR ce.title ILIKE '%work%'
         OR ua.account_type = 'lyra'
       )
       ORDER BY ce.start_time ASC`,
      [weekStart, weekEnd]
    );

    let totalHours = 0;
    const events: any[] = [];

    for (const event of result.rows) {
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

      totalHours += hours;
      events.push({
        title: event.title,
        start: event.start_time,
        end: event.end_time,
        hours: Math.round(hours * 100) / 100,
        email: event.email,
      });
    }

    // Round to 2 decimal places
    totalHours = Math.round(totalHours * 100) / 100;

    // Update the database
    const week = await lyraWorkHoursRepository.getOrCreateWeek(weekStart);
    await lyraWorkHoursRepository.updateHours(
      week.week_start_date,
      totalHours,
      events
    );

    return { totalHours, events };
  }

  /**
   * Get current killswitch status
   */
  async getStatus(): Promise<KillswitchStatus> {
    const { totalHours } = await this.calculateWeeklyHours();
    const weekStart = lyraWorkHoursRepository.getWeekStart();
    const dateStr = weekStart.toISOString().split('T')[0];

    const isActive = await lyraWorkHoursRepository.isKillswitchActive();
    const alertSent = await lyraWorkHoursRepository.wasAlertSent();

    return {
      currentHours: totalHours,
      remainingHours: Math.max(0, KILLSWITCH_THRESHOLD - totalHours),
      isActive: isActive || totalHours >= KILLSWITCH_THRESHOLD,
      alertSent,
      weekStartDate: dateStr,
    };
  }

  /**
   * Check hours and trigger alerts/killswitch if needed
   * Called periodically by scheduler
   */
  async checkAndEnforce(): Promise<void> {
    const status = await this.getStatus();

    console.log(`⏱️  Lyra hours this week: ${status.currentHours}/${KILLSWITCH_THRESHOLD}`);

    // Trigger killswitch at 40 hours
    if (status.currentHours >= KILLSWITCH_THRESHOLD && !status.isActive) {
      await lyraWorkHoursRepository.triggerKillswitch(status.weekStartDate);

      const message = `🛑 KILLSWITCH ACTIVE: You've hit ${KILLSWITCH_THRESHOLD} Lyra hours this week. No new Lyra tasks until Monday. Focus on Persephone! 🎵`;
      await smsService.sendSMS(config.kathyPhoneNumber, message);

      console.log('🛑 Killswitch triggered!');
      return;
    }

    // Send alert at 35 hours
    if (status.currentHours >= ALERT_THRESHOLD && !status.alertSent) {
      await lyraWorkHoursRepository.markAlertSent(status.weekStartDate);

      const remaining = Math.round(status.remainingHours * 10) / 10;
      const message = `⚠️ Lyra Work Alert: You're at ${status.currentHours} hours this week (${remaining} hours remaining before killswitch). Protect your creative time!`;
      await smsService.sendSMS(config.kathyPhoneNumber, message);

      console.log('⚠️ 35-hour alert sent');
    }
  }

  /**
   * Check if a new Lyra task should be blocked
   * Returns { blocked: boolean, message: string }
   */
  async shouldBlockLyraTask(): Promise<{ blocked: boolean; message: string }> {
    const status = await this.getStatus();

    if (status.isActive || status.currentHours >= KILLSWITCH_THRESHOLD) {
      return {
        blocked: true,
        message: `🛑 Killswitch active! You're at ${status.currentHours}/${KILLSWITCH_THRESHOLD} Lyra hours this week. No new Lyra tasks until Monday. Focus on Persephone instead! 🎵`,
      };
    }

    if (status.remainingHours <= 2) {
      return {
        blocked: false,
        message: `⚠️ Only ${status.remainingHours} Lyra hours remaining this week.`,
      };
    }

    return { blocked: false, message: '' };
  }

  /**
   * Format a friendly status message for SMS
   */
  async formatStatusMessage(): Promise<string> {
    const status = await this.getStatus();
    const remaining = Math.round(status.remainingHours * 10) / 10;

    if (status.isActive) {
      return `🛑 Killswitch is ACTIVE. You've logged ${status.currentHours} Lyra hours this week. No new Lyra tasks until Monday. Use this time for Persephone! 🎵`;
    }

    const bar = this.buildProgressBar(status.currentHours, KILLSWITCH_THRESHOLD);

    return `⏱️ Lyra hours this week: ${status.currentHours}/${KILLSWITCH_THRESHOLD}\n${bar}\n${remaining} hours remaining.`;
  }

  private buildProgressBar(current: number, max: number): string {
    const filled = Math.min(Math.round((current / max) * 10), 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}

export const killswitchService = new KillswitchService();
