import { taskRepository } from '../../repositories/task.repository';
import { messageParserService } from '../sms/message-parser.service';
import { taskValidatorService } from '../ai/task-validator.service';
import { pushbackService } from '../ai/pushback.service';
import { calendarService } from '../calendar/calendar.service';
import { killswitchService } from '../killswitch/killswitch.service';
import { queryService } from '../ai/query.service';
import { claudeService } from '../ai/claude.service';
import { eveningCheckinService } from '../briefing/evening-checkin.service';
import { healthCheckinRepository } from '../../repositories/health-checkin.repository';
import { actionService } from '../sms/action.service';
import { emailTodoService } from '../email/email-todo.service';
import { pool } from '../../config/database';

export type MessageType = 'query' | 'task' | 'killswitch' | 'action' | 'checkin' | 'email_scan';

export interface ChatResponse {
  response: string;
  messageType: MessageType;
}

/**
 * Classify a message into one of: query, task, killswitch, action.
 * Uses fast keyword matching first, then Claude for ambiguous cases.
 */
export async function classifyMessage(body: string): Promise<MessageType> {
  const lower = body.toLowerCase().trim();

  // Fast path: email scan requests
  if (
    (lower.includes('scan') && lower.includes('email')) ||
    (lower.includes('email') && lower.includes('todo')) ||
    (lower.includes('check') && lower.includes('email') && lower.includes('task')) ||
    lower.includes('email action items') ||
    lower === 'emails'
  ) {
    return 'email_scan';
  }

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
    return 'task';
  }
}

/**
 * Get the appropriate account ID for a task category.
 */
async function getAccountIdForCategory(category: string): Promise<string | undefined> {
  const accountTypeMap: Record<string, string> = {
    lyra: 'lyra',
    music: 'music',
    personal: 'personal',
    house: 'personal',
  };

  const accountType = accountTypeMap[category] || 'personal';

  const result = await pool.query(
    `SELECT ua.id FROM user_accounts ua
     JOIN oauth_tokens ot ON ua.id = ot.account_id
     WHERE ua.account_type = $1 AND ot.provider = 'google'
     LIMIT 1`,
    [accountType]
  );

  if (result.rows.length > 0) return result.rows[0].id;

  const primary = await pool.query(
    `SELECT ua.id FROM user_accounts ua
     JOIN oauth_tokens ot ON ua.id = ot.account_id
     WHERE ua.is_primary = true AND ot.provider = 'google'
     LIMIT 1`
  );

  return primary.rows[0]?.id;
}

/**
 * Process a message through the full Kathy pipeline.
 * Returns the response string and message type — does NOT send SMS.
 * This is used by both the SMS worker and the web chat endpoint.
 */
export async function processMessage(body: string, messageSid?: string): Promise<ChatResponse> {
  // Check if this is a response to a pending evening check-in
  const pendingCheckin = await healthCheckinRepository.findPendingResponse();
  if (pendingCheckin) {
    const response = await eveningCheckinService.processResponse(body);
    return { response, messageType: 'checkin' };
  }

  // Classify message
  const messageType = await classifyMessage(body);
  console.log(`📋 Message classified as: ${messageType}`);

  if (messageType === 'killswitch') {
    const response = await killswitchService.formatStatusMessage();
    return { response, messageType: 'killswitch' };
  }

  if (messageType === 'query') {
    const response = await queryService.answer(body);
    return { response, messageType: 'query' };
  }

  if (messageType === 'action') {
    const response = await actionService.execute(body);
    return { response, messageType: 'action' };
  }

  if (messageType === 'email_scan') {
    const response = await emailTodoService.scanAndReport();
    return { response, messageType: 'email_scan' };
  }

  // Task creation flow
  console.log(`🤖 Parsing SMS with Claude: "${body}"`);
  const parsedTask = await messageParserService.parse(body);
  console.log(`✓ Parsed task:`, parsedTask);

  // Check killswitch for Lyra tasks
  if (parsedTask.category === 'lyra') {
    const killcheck = await killswitchService.shouldBlockLyraTask();
    if (killcheck.blocked) {
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
        created_from_message_sid: messageSid || 'web',
      });

      return { response: killcheck.message, messageType: 'task' };
    }
  }

  // Validate task against goals
  console.log(`🎯 Validating against goals...`);
  const validation = await taskValidatorService.validate(parsedTask);
  console.log(`✓ Validation: score=${validation.alignmentScore.toFixed(2)}, valid=${validation.isValid}`);

  if (validation.needsClarification) {
    const clarificationMsg = validation.clarificationPrompt || 'Can you provide more details about this task?';

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
      created_from_message_sid: messageSid || 'web',
    });

    return { response: clarificationMsg, messageType: 'task' };
  }

  if (validation.alignmentScore < 0.5) {
    const pushbackMsg = await pushbackService.generate(parsedTask, validation);

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
      created_from_message_sid: messageSid || 'web',
    });

    return { response: pushbackMsg, messageType: 'task' };
  }

  // Task is valid — create it
  let conflictWarning = '';
  const accountId = await getAccountIdForCategory(parsedTask.category);

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
    created_from_message_sid: messageSid || 'web',
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

  if (parsedTask.category === 'lyra') {
    const killcheck = await killswitchService.shouldBlockLyraTask();
    if (killcheck.message) {
      confirmationMessage += `\n\n${killcheck.message}`;
    }
  }

  if (validation.alignmentScore < 0.7 && validation.reasoning) {
    confirmationMessage += `\n\nHeads up: ${validation.reasoning}`;
  }

  return { response: confirmationMessage, messageType: 'task' };
}

export const chatProcessingService = { classifyMessage, processMessage };
