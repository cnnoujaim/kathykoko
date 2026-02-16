import { calendarQueue } from '../queue';
import { calendarService } from '../../services/calendar/calendar.service';

/**
 * Schedule recurring calendar sync jobs
 * Run every 15 minutes for all connected accounts
 *
 * Note: Account IDs will be dynamically loaded in Sprint 4
 * For now, this is a manual setup for testing
 */
export function scheduleCalendarSync() {
  // TODO: Sprint 4 - Load account IDs dynamically from database
  const accountIds = [
    process.env.PERSONAL_ACCOUNT_ID,
    process.env.MUSIC_ACCOUNT_ID,
    process.env.LYRA_ACCOUNT_ID,
  ].filter(Boolean) as string[];

  if (accountIds.length === 0) {
    console.log('⚠️  No account IDs configured for calendar sync');
    return;
  }

  for (const accountId of accountIds) {
    calendarQueue.add(
      'sync-calendar',
      { account_id: accountId },
      {
        repeat: { cron: '*/15 * * * *' }, // Every 15 minutes
        jobId: `sync-${accountId}`, // Prevent duplicates
      }
    );
  }

  console.log(`✓ Calendar sync scheduled for ${accountIds.length} account(s)`);
}

/**
 * Auto-block studio time at the start of each week
 * Run every Monday at 6am
 */
export function scheduleStudioTimeBlocking() {
  const musicAccountId = process.env.MUSIC_ACCOUNT_ID;

  if (!musicAccountId) {
    console.log('⚠️  No MUSIC_ACCOUNT_ID configured for studio time blocking');
    return;
  }

  calendarQueue.add(
    'auto-block-studio',
    {},
    {
      repeat: { cron: '0 6 * * 1' }, // Monday 6am
      jobId: 'auto-block-studio-weekly',
    }
  );

  console.log('✓ Studio time auto-blocking scheduled');
}

// Worker for auto-block job
calendarQueue.process('auto-block-studio', async () => {
  const musicAccountId = process.env.MUSIC_ACCOUNT_ID;
  if (!musicAccountId) {
    console.error('No MUSIC_ACCOUNT_ID configured');
    return;
  }

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  // Set to start of week (Monday)
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff);

  await calendarService.autoBlockStudioTime(musicAccountId, weekStart, 8);
});
