import app from './app';
import { config, validateConfig } from './config';
import { pool } from './config/database';
import { redis } from './config/redis';
import { scheduleCalendarSync, scheduleStudioTimeBlocking } from './jobs/schedulers/calendar.scheduler';
import { scheduleKillswitchChecks } from './jobs/schedulers/killswitch.scheduler';
import { scheduleEmailSync } from './jobs/schedulers/email.scheduler';
import { scheduleBriefings } from './jobs/schedulers/briefing.scheduler';

async function startServer() {
  try {
    // Validate environment variables
    validateConfig();

    // Test database connection
    await pool.query('SELECT 1');
    console.log('✓ Database connected');

    // Test Redis connection
    await redis.ping();
    console.log('✓ Redis connected');

    // Initialize scheduled jobs
    await scheduleCalendarSync();
    await scheduleStudioTimeBlocking();
    scheduleKillswitchChecks();
    scheduleEmailSync();
    scheduleBriefings();
    console.log('✓ Scheduled jobs initialized');

    // Start server
    const port = config.port;
    app.listen(port, () => {
      console.log('');
      console.log('🚀 Kathy Koko is live!');
      console.log(`📍 Server running on port ${port}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log('');
      console.log('Endpoints:');
      console.log(`  GET  /health`);
      console.log(`  GET  /health/integrations`);
      console.log(`  POST /webhooks/sms/incoming`);
      console.log(`  POST /webhooks/sms/status`);
      console.log(``);
      console.log(`  🔑 GET  /oauth/connect  (Easy onboarding!)`);
      console.log(`  GET  /oauth/authorize?account_id=<uuid>`);
      console.log(`  GET  /oauth/callback`);
      console.log(``);
      console.log(`  POST /calendar/sync/:account_id`);
      console.log(`  GET  /calendar/conflicts/:account_id`);
      console.log(``);
      console.log(`  ⏱️  GET  /killswitch/status`);
      console.log(`  GET  /killswitch/hours`);
      console.log(``);
      console.log(`  📧 POST /email/scan`);
      console.log(`  GET  /email/recent`);
      console.log(`  GET  /email/urgent`);
      console.log(`  GET  /email/drafts`);
      console.log(`  POST /email/draft/:email_id`);
      console.log(`  POST /email/send/:draft_id`);
      console.log(``);
      console.log(`  ☀️  POST /briefing/morning  (manual trigger)`);
      console.log(`  🌙 POST /briefing/evening  (manual trigger)`);
      console.log(`  GET  /briefing/preview`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
