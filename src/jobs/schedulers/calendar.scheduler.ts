import { calendarQueue } from '../queue';
import { calendarService } from '../../services/calendar/calendar.service';
import { pool } from '../../config/database';

/**
 * Load all connected account IDs from database (accounts with OAuth tokens)
 */
async function getConnectedAccountIds(): Promise<string[]> {
  const result = await pool.query(
    `SELECT DISTINCT ua.id FROM user_accounts ua
     JOIN oauth_tokens ot ON ua.id = ot.account_id
     WHERE ot.provider = 'google'`
  );
  return result.rows.map((r: any) => r.id);
}

/**
 * Schedule recurring calendar sync jobs
 * Run every 15 minutes for all connected accounts
 */
export async function scheduleCalendarSync() {
  const accountIds = await getConnectedAccountIds();

  if (accountIds.length === 0) {
    console.log('⚠️  No connected accounts for calendar sync');
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
export async function scheduleStudioTimeBlocking() {
  // Find music account dynamically
  const result = await pool.query(
    `SELECT ua.id FROM user_accounts ua
     JOIN oauth_tokens ot ON ua.id = ot.account_id
     WHERE ua.account_type = 'music' AND ot.provider = 'google'
     LIMIT 1`
  );

  if (result.rows.length === 0) {
    console.log('⚠️  No music account connected for studio time blocking');
    return;
  }

  const musicAccountId = result.rows[0].id;

  calendarQueue.add(
    'auto-block-studio',
    { account_id: musicAccountId },
    {
      repeat: { cron: '0 6 * * 1' }, // Monday 6am
      jobId: 'auto-block-studio-weekly',
    }
  );

  console.log('✓ Studio time auto-blocking scheduled');
}

// Worker for auto-block job
calendarQueue.process('auto-block-studio', async (job) => {
  const musicAccountId = job.data.account_id;
  if (!musicAccountId) {
    console.error('No music account ID in job data');
    return;
  }

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff);

  await calendarService.autoBlockStudioTime(musicAccountId, weekStart, 8);
});
