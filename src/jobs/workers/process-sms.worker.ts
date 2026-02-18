import { Job } from 'bull';
import { messageRepository } from '../../repositories/message.repository';
import { smsService } from '../../services/sms/sms.service';
import { chatProcessingService } from '../../services/chat/chat-processing.service';
import { smsQueue } from '../queue';

interface ProcessSMSJobData {
  messageSid: string;
  from: string;
  body: string;
}

/**
 * Worker to process SMS messages asynchronously.
 * Delegates to chatProcessingService for the actual processing,
 * then sends the response via SMS.
 */
async function processSMSWorker(job: Job<ProcessSMSJobData>) {
  const { messageSid, from, body } = job.data;

  console.log(`🔄 Processing SMS job ${job.id} for message ${messageSid}`);

  try {
    // 1. Update message status to 'processing'
    await messageRepository.updateStatus(messageSid, 'processing');

    // 2. Process message through the full pipeline
    const { response, messageType } = await chatProcessingService.processMessage(body, messageSid);
    console.log(`📋 Message classified as: ${messageType}`);

    // 3. Send response via SMS
    await smsService.sendSMS(from, response);

    // 4. Update message status to 'processed'
    await messageRepository.updateStatus(messageSid, 'processed');

    console.log(`✓ SMS processing complete for ${messageSid}`);
  } catch (error) {
    console.error(`✗ Failed to process SMS ${messageSid}:`, error);

    await messageRepository.updateStatus(messageSid, 'failed');

    await smsService.sendSMS(
      from,
      "Sorry, I had trouble processing that. Can you try rephrasing?"
    );

    throw error; // Will trigger Bull retry logic
  }
}

// Register the worker
smsQueue.process('process-sms', processSMSWorker);

console.log('✓ SMS processing worker registered');

export default processSMSWorker;
