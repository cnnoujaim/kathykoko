import { calendarQueue } from '../queue';
import { killswitchService } from '../../services/killswitch/killswitch.service';

/**
 * Schedule killswitch monitoring jobs
 */
export function scheduleKillswitchChecks() {
  // Check Lyra hours every hour during work hours (9am-7pm EST, Mon-Fri)
  calendarQueue.add(
    'killswitch-check',
    {},
    {
      repeat: { cron: '0 9-19 * * 1-5' }, // Every hour, 9am-7pm, Mon-Fri
      jobId: 'killswitch-hourly-check',
    }
  );

  console.log('✓ Killswitch monitoring scheduled (hourly, Mon-Fri 9am-7pm)');
}

// Worker for killswitch check
calendarQueue.process('killswitch-check', async () => {
  console.log('⏱️  Running killswitch check...');
  await killswitchService.checkAndEnforce();
});
