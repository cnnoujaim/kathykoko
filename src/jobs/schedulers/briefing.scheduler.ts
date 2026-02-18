import { calendarQueue } from '../queue';
import { morningBriefingService } from '../../services/briefing/morning-briefing.service';
import { eveningCheckinService } from '../../services/briefing/evening-checkin.service';

/**
 * Schedule daily briefing jobs:
 * - 7:30 AM EST: Morning briefing
 * - 8:00 PM EST: Evening check-in
 */
export function scheduleBriefings() {
  // Morning briefing at 7:30 AM EST every day
  calendarQueue.add(
    'morning-briefing',
    {},
    {
      repeat: { cron: '30 7 * * *', tz: 'America/Los_Angeles' },
      jobId: 'morning-briefing-daily',
    }
  );

  // Evening check-in at 8:00 PM EST every day
  calendarQueue.add(
    'evening-checkin',
    {},
    {
      repeat: { cron: '0 20 * * *', tz: 'America/Los_Angeles' },
      jobId: 'evening-checkin-daily',
    }
  );

  console.log('✓ Daily briefings scheduled (7:30 AM + 8:00 PM Pacific)');
}

// Worker for morning briefing
calendarQueue.process('morning-briefing', async () => {
  console.log('☀️  Sending morning briefing...');
  await morningBriefingService.sendBriefing();
});

// Worker for evening check-in
calendarQueue.process('evening-checkin', async () => {
  console.log('🌙 Sending evening check-in...');
  await eveningCheckinService.sendCheckin();
});
