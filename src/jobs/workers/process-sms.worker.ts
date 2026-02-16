import { Job } from 'bull';
import { messageRepository } from '../../repositories/message.repository';
import { taskRepository } from '../../repositories/task.repository';
import { messageParserService } from '../../services/sms/message-parser.service';
import { taskValidatorService } from '../../services/ai/task-validator.service';
import { pushbackService } from '../../services/ai/pushback.service';
import { smsService } from '../../services/sms/sms.service';
import { calendarService } from '../../services/calendar/calendar.service';
import { killswitchService } from '../../services/killswitch/killswitch.service';
import { queryService } from '../../services/ai/query.service';
import { claudeService } from '../../services/ai/claude.service';
import { eveningCheckinService } from '../../services/briefing/evening-checkin.service';
import { healthCheckinRepository } from '../../repositories/health-checkin.repository';
import { actionService } from '../../services/sms/action.service';
import { smsQueue } from '../queue';
import { pool } from '../../config/database';

interface ProcessSMSJobData {
  messageSid: string;
  from: string;
  body: string;
}

/**
 * Determine if the message is a question/query vs a task to create.
 * Uses Claude for ambiguous cases, fast keyword matching for obvious ones.
 */
async function classifyMessage(body: string): Promise<'query' | 'task' | 'killswitch' | 'action'> {
  const lower = body.toLowerCase().trim();

  // Fast path: killswitch-specific queries
  if (
    lower.includes('lyra hours') ||
    lower.includes('work hours') ||
    lower.includes('killswitch') ||
    (lower.includes('how many hours') && lower.includes('week'))
  ) {
    return 'killswitch';
  }

  // Fast path: action commands (managing existing tasks/events)
  const actionVerbs = [
    'mark', 'complete', 'finish', 'done',
    'delete', 'remove',
    'cancel',
    'reschedule', 'move',
    'change', 'edit', 'update', 'rename',
    'prioritize', 'reprioritize',
  ];
  const actionPatterns = [
    /\b(mark|check off|finished|completed)\b.*\b(done|complete|finished)\b/,
    /\b(delete|remove|cancel)\b.*\b(task|event|meeting|appointment)\b/,
    /\b(cancel|delete)\b\s+(my|the)\b/,
    /\b(reschedule|move)\b.*\b(to|for)\b/,
    /\b(change|edit|update|rename)\b.*\b(task|to|priority)\b/,
    /\b(set|change)\b.*\b(priority|urgent|high|medium|low)\b/,
    /\bmark\b.*\bas\b/,
  ];

  if (actionPatterns.some(pattern => pattern.test(lower))) {
    return 'action';
  }

  // Fast path: obvious questions
  if (
    lower.startsWith('what') ||
    lower.startsWith('when') ||
    lower.startsWith('where') ||
    lower.startsWith('who') ||
    lower.startsWith('how') ||
    lower.startsWith('am i') ||
    lower.startsWith('do i') ||
    lower.startsWith('is there') ||
    lower.startsWith('are there') ||
    lower.startsWith('can i') ||
    lower.startsWith('show me') ||
    lower.startsWith('tell me') ||
    lower.endsWith('?')
  ) {
    return 'query';
  }

  // Ambiguous: use Claude to classify
  try {
    const classification = await claudeService.completeJSON<{ type: 'query' | 'task' | 'action' }>(
      `Classify this SMS into one of three types:
- "query": asking a question about schedule, calendar, tasks, or status
- "task": requesting to create something new (a new task, reminder, etc.)
- "action": managing an existing task or calendar event (mark done, delete, edit, reschedule, cancel, reprioritize)

SMS: "${body}"

Return JSON: {"type": "query"} or {"type": "task"} or {"type": "action"}`,
      'You classify SMS messages. Return only valid JSON.',
      64
    );
    return classification.type;
  } catch {
    // Default to task if classification fails
    return 'task';
  }
}

/**
 * Get the appropriate account ID for a task category
 */
async function getAccountIdForCategory(category: string): Promise<string | undefined> {
  // Map category to account type
  const accountTypeMap: Record<string, string> = {
    lyra: 'lyra',
    music: 'music',
    personal: 'personal',
    house: 'personal',
  };

  const accountType = accountTypeMap[category] || 'personal';

  // Try to find matching account
  const result = await pool.query(
    `SELECT ua.id FROM user_accounts ua
     JOIN oauth_tokens ot ON ua.id = ot.account_id
     WHERE ua.account_type = $1 AND ot.provider = 'google'
     LIMIT 1`,
    [accountType]
  );

  if (result.rows.length > 0) return result.rows[0].id;

  // Fall back to primary account
  const primary = await pool.query(
    `SELECT ua.id FROM user_accounts ua
     JOIN oauth_tokens ot ON ua.id = ot.account_id
     WHERE ua.is_primary = true AND ot.provider = 'google'
     LIMIT 1`
  );

  return primary.rows[0]?.id;
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

    // 1.1. Check if this is a response to a pending evening check-in
    const pendingCheckin = await healthCheckinRepository.findPendingResponse();
    if (pendingCheckin) {
      const response = await eveningCheckinService.processResponse(body);
      await smsService.sendSMS(from, response);
      await messageRepository.updateStatus(messageSid, 'processed');
      console.log(`✓ Evening check-in response processed for ${messageSid}`);
      return;
    }

    // 1.5. Classify: is this a question or a task?
    const messageType = await classifyMessage(body);
    console.log(`📋 Message classified as: ${messageType}`);

    if (messageType === 'killswitch') {
      const response = await killswitchService.formatStatusMessage();
      await smsService.sendSMS(from, response);
      await messageRepository.updateStatus(messageSid, 'processed');
      console.log(`✓ Killswitch query response sent for ${messageSid}`);
      return;
    }

    if (messageType === 'query') {
      const response = await queryService.answer(body);
      await smsService.sendSMS(from, response);
      await messageRepository.updateStatus(messageSid, 'processed');
      console.log(`✓ Query response sent for ${messageSid}`);
      return;
    }

    if (messageType === 'action') {
      const response = await actionService.execute(body);
      await smsService.sendSMS(from, response);
      await messageRepository.updateStatus(messageSid, 'processed');
      console.log(`✓ Action executed for ${messageSid}`);
      return;
    }

    // 2. Parse SMS into structured task using Claude
    console.log(`🤖 Parsing SMS with Claude: "${body}"`);
    const parsedTask = await messageParserService.parse(body);
    console.log(`✓ Parsed task:`, parsedTask);

    // 2.5. Check killswitch for Lyra tasks
    if (parsedTask.category === 'lyra') {
      const killcheck = await killswitchService.shouldBlockLyraTask();
      if (killcheck.blocked) {
        await smsService.sendSMS(from, killcheck.message);

        await taskRepository.create({
          raw_text: body,
          parsed_title: parsedTask.title,
          description: parsedTask.description || '',
          priority: parsedTask.priority,
          category: parsedTask.category,
          status: 'rejected',
          alignment_score: 0,
          pushback_reason: 'Blocked by 40-hour killswitch',
          due_date: parsedTask.due_date ? new Date(parsedTask.due_date) : undefined,
          estimated_hours: parsedTask.estimated_hours || undefined,
          created_from_message_sid: messageSid,
        });

        await messageRepository.updateStatus(messageSid, 'processed');
        console.log(`🛑 Lyra task blocked by killswitch: ${parsedTask.title}`);
        return;
      }

      // Add low-hours warning to confirmation
      if (killcheck.message) {
        console.log(`⚠️ ${killcheck.message}`);
      }
    }

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
      // Task is valid - check calendar conflicts before creating
      let conflictWarning = '';
      const accountId = await getAccountIdForCategory(parsedTask.category);

      // Check calendar conflicts if task has due date & estimated hours
      if (parsedTask.due_date && parsedTask.estimated_hours && accountId) {
        const dueDate = new Date(parsedTask.due_date);
        const endTime = new Date(dueDate.getTime() + parsedTask.estimated_hours * 60 * 60 * 1000);

        try {
          const conflict = await calendarService.checkConflicts(accountId, dueDate, endTime);
          if (conflict.hasConflict) {
            const conflictCount = conflict.conflicts.length;
            const conflictSummary = conflict.conflicts[0].title || 'event';
            conflictWarning = `\n\n⚠️ Calendar conflict: ${conflictCount} event(s) at that time (${conflictSummary})`;
          }
        } catch (error) {
          console.error('Calendar conflict check failed:', error);
        }
      }

      // Create task
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
        account_id: accountId,
      });

      console.log(`✓ Task created: ${task.id} - ${task.parsed_title}`);

      // Auto-add to calendar if task has due date
      if (task.due_date && task.estimated_hours && accountId) {
        try {
          const startTime = new Date(task.due_date);
          const endTime = new Date(startTime.getTime() + task.estimated_hours * 60 * 60 * 1000);

          await calendarService.createEventFromTask(
            accountId,
            task.id,
            task.parsed_title || 'Task',
            startTime,
            endTime,
            task.description || undefined
          );

          console.log(`✓ Added task ${task.id} to calendar`);
        } catch (error) {
          console.error('Failed to add task to calendar:', error);
        }
      }

      // Build confirmation message
      let confirmationMessage = `Got it! Added: ${parsedTask.title}${conflictWarning}`;

      // Add killswitch warning for Lyra tasks
      if (parsedTask.category === 'lyra') {
        const killcheck = await killswitchService.shouldBlockLyraTask();
        if (killcheck.message) {
          confirmationMessage += `\n\n${killcheck.message}`;
        }
      }

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
