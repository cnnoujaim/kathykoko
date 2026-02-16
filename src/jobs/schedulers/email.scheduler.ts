import { calendarQueue } from '../queue';
import { emailScannerService } from '../../services/email/email-scanner.service';

/**
 * Schedule email scanning jobs
 * Scans every 10 minutes for new emails, checks urgency, auto-drafts
 */
export function scheduleEmailSync() {
  calendarQueue.add(
    'email-scan',
    {},
    {
      repeat: { cron: '*/10 * * * *' }, // Every 10 minutes
      jobId: 'email-scan-recurring',
    }
  );

  console.log('✓ Email scanning scheduled (every 10 minutes)');
}

// Worker for email scan
calendarQueue.process('email-scan', async () => {
  console.log('📧 Running email scan...');
  await emailScannerService.fullScan();
});
