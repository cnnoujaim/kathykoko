import { Job } from 'bull';
import { messageRepository } from '../../repositories/message.repository';
import { taskRepository } from '../../repositories/task.repository';
import { messageParserService } from '../../services/sms/message-parser.service';
import { taskValidatorService } from '../../services/ai/task-validator.service';
import { pushbackService } from '../../services/ai/pushback.service';
import { smsService } from '../../services/sms/sms.service';
import { smsQueue } from '../queue';

interface ProcessSMSJobData {
  messageSid: string;
  from: string;
  body: string;
}

/**
 * Worker to process SMS messages asynchronously
 * This runs AFTER the webhook has returned TwiML (outside the 500ms window)
 */
async function processSMSWorker(job: Job<ProcessSMSJobData>) {
  const { messageSid, from, body } = job.data;

  console.log(`🔄 Processing SMS job ${job.id} for message ${messageSid}`);

  try {
    // 1. Update message status to 'processing'
    await messageRepository.updateStatus(messageSid, 'processing');

    // 2. Parse SMS into structured task using Claude
    console.log(`🤖 Parsing SMS with Claude: "${body}"`);
    const parsedTask = await messageParserService.parse(body);
    console.log(`✓ Parsed task:`, parsedTask);

    // 3. Validate task against 2026 goals
    console.log(`🎯 Validating against goals...`);
    const validation = await taskValidatorService.validate(parsedTask);
    console.log(`✓ Validation: score=${validation.alignmentScore.toFixed(2)}, valid=${validation.isValid}`);

    // 4. Handle validation results
    if (validation.needsClarification) {
      // Ask for clarification
      const clarificationMsg = validation.clarificationPrompt || 'Can you provide more details about this task?';
      await smsService.sendSMS(from, clarificationMsg);

      // Create task with clarification_needed status
      await taskRepository.create({
        raw_text: body,
        parsed_title: parsedTask.title,
        description: parsedTask.description || '',
        priority: parsedTask.priority,
        category: parsedTask.category,
        status: 'clarification_needed',
        alignment_score: validation.alignmentScore,
        due_date: parsedTask.due_date ? new Date(parsedTask.due_date) : undefined,
        estimated_hours: parsedTask.estimated_hours || undefined,
        created_from_message_sid: messageSid,
      });
    } else if (validation.alignmentScore < 0.5) {
      // Generate pushback for low-value tasks
      const pushbackMsg = await pushbackService.generate(parsedTask, validation);
      await smsService.sendSMS(from, pushbackMsg);

      // Create task with rejected status
      await taskRepository.create({
        raw_text: body,
        parsed_title: parsedTask.title,
        description: parsedTask.description || '',
        priority: parsedTask.priority,
        category: parsedTask.category,
        status: 'rejected',
        alignment_score: validation.alignmentScore,
        pushback_reason: validation.reasoning,
        due_date: parsedTask.due_date ? new Date(parsedTask.due_date) : undefined,
        estimated_hours: parsedTask.estimated_hours || undefined,
        created_from_message_sid: messageSid,
      });
    } else {
      // Task is valid - create and confirm
      const task = await taskRepository.create({
        raw_text: body,
        parsed_title: parsedTask.title,
        description: parsedTask.description || '',
        priority: parsedTask.priority,
        category: parsedTask.category,
        status: 'pending',
        alignment_score: validation.alignmentScore,
        due_date: parsedTask.due_date ? new Date(parsedTask.due_date) : undefined,
        estimated_hours: parsedTask.estimated_hours || undefined,
        created_from_message_sid: messageSid,
      });

      console.log(`✓ Task created: ${task.id} - ${task.parsed_title}`);

      // Send confirmation (with optional heads-up for medium priority)
      let confirmationMessage = `Got it! Added: ${parsedTask.title}`;

      if (validation.alignmentScore < 0.7 && validation.reasoning) {
        confirmationMessage += `\n\nHeads up: ${validation.reasoning}`;
      }

      await smsService.sendSMS(from, confirmationMessage);
    }

    // 5. Update message status to 'processed'
    await messageRepository.updateStatus(messageSid, 'processed');

    console.log(`✓ SMS processing complete for ${messageSid}`);
  } catch (error) {
    console.error(`✗ Failed to process SMS ${messageSid}:`, error);

    // Update message status to 'failed'
    await messageRepository.updateStatus(messageSid, 'failed');

    // Send error SMS to user
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
