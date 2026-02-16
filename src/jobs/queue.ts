import Bull from 'bull';
import { config } from '../config';

// Initialize Bull queue for SMS processing
export const smsQueue = new Bull('sms-processing', config.redisUrl, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// Queue event handlers
smsQueue.on('completed', (job) => {
  console.log(`✓ Job ${job.id} completed successfully`);
});

smsQueue.on('failed', (job, err) => {
  console.error(`✗ Job ${job?.id} failed:`, err.message);
});

smsQueue.on('error', (error) => {
  console.error('Queue error:', error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Closing SMS queue...');
  await smsQueue.close();
});

export default smsQueue;
