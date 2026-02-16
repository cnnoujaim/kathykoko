import { Job } from 'bull';
import { calendarService } from '../../services/calendar/calendar.service';
import { calendarQueue } from '../queue';

interface CalendarSyncJobData {
  account_id: string;
  calendar_id?: string;
}

/**
 * Worker to sync Google Calendar events to local database
 * Runs periodically (every 15 minutes) to keep local cache fresh
 */
async function calendarSyncWorker(job: Job<CalendarSyncJobData>) {
  const { account_id, calendar_id = 'primary' } = job.data;

  console.log(`📅 Starting calendar sync for account ${account_id}`);

  try {
    await calendarService.syncEvents(account_id, calendar_id);
    console.log(`✓ Calendar sync completed for account ${account_id}`);
  } catch (error) {
    console.error(`✗ Calendar sync failed for account ${account_id}:`, error);
    throw error; // Will trigger Bull retry
  }
}

// Register worker
calendarQueue.process('sync-calendar', calendarSyncWorker);

console.log('✓ Calendar sync worker registered');

export default calendarSyncWorker;
