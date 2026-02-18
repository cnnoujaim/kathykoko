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
import { goalRepository } from '../../repositories/goal.repository';
import { goalMilestoneRepository } from '../../repositories/goal-milestone.repository';
import { embeddingsService } from '../ai/embeddings.service';
import { pool } from '../../config/database';

export type MessageType = 'query' | 'task' | 'killswitch' | 'action' | 'checkin' | 'email_scan' | 'goals';

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

  // Fast path: goal setup/onboarding
  if (
    (lower.includes('set') && lower.includes('goal')) ||
    (lower.includes('my goal') && !lower.startsWith('what')) ||
    lower.includes('goal onboarding') ||
    (lower.includes('help') && lower.includes('goal')) ||
    (lower.includes('plan') && lower.includes('goal')) ||
    lower === 'goals'
  ) {
    return 'goals';
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
 * Get the appropriate account ID for a task category, scoped to a user.
 */
async function getAccountIdForCategory(category: string, userId?: string): Promise<string | undefined> {
  const accountTypeMap: Record<string, string> = {
    lyra: 'lyra',
    music: 'music',
    personal: 'personal',
    house: 'personal',
    work: 'lyra',
    home: 'personal',
  };

  const accountType = accountTypeMap[category] || 'personal';

  const userFilter = userId ? ' AND ua.user_id = $2' : '';
  const params = userId ? [accountType, userId] : [accountType];

  const result = await pool.query(
    `SELECT ua.id FROM user_accounts ua
     JOIN oauth_tokens ot ON ua.id = ot.account_id
     WHERE ua.account_type = $1 AND ot.provider = 'google'${userFilter}
     LIMIT 1`,
    params
  );

  if (result.rows.length > 0) return result.rows[0].id;

  const primaryFilter = userId ? ' AND ua.user_id = $1' : '';
  const primaryParams = userId ? [userId] : [];

  const primary = await pool.query(
    `SELECT ua.id FROM user_accounts ua
     JOIN oauth_tokens ot ON ua.id = ot.account_id
     WHERE ua.is_primary = true AND ot.provider = 'google'${primaryFilter}
     LIMIT 1`,
    primaryParams
  );

  return primary.rows[0]?.id;
}

/**
 * Process a message through the full Kathy pipeline.
 * Returns the response string and message type — does NOT send SMS.
 * This is used by both the SMS worker and the web chat endpoint.
 */
export async function processMessage(body: string, messageSid?: string, userId?: string): Promise<ChatResponse> {
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

  if (messageType === 'goals') {
    const response = await handleGoalOnboarding(body, userId);
    return { response, messageType: 'goals' };
  }

  // Task creation flow — supports multiple tasks from one message
  console.log(`🤖 Parsing SMS with Claude: "${body}"`);
  const parsedTasks = await messageParserService.parse(body);
  console.log(`✓ Parsed ${parsedTasks.length} task(s):`, parsedTasks.map(t => t.title));

  const confirmations: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < parsedTasks.length; i++) {
    const parsedTask = parsedTasks[i];
    const sid = messageSid ? `${messageSid}${parsedTasks.length > 1 ? `-${i}` : ''}` : 'web';

    // Check killswitch for Lyra tasks — defer instead of reject
    if (parsedTask.category === 'lyra' || parsedTask.category === 'work') {
      const killcheck = await killswitchService.shouldBlockLyraTask(userId);
      if (killcheck.blocked) {
        await taskRepository.create({
          raw_text: body,
          parsed_title: parsedTask.title,
          description: parsedTask.description || '',
          priority: parsedTask.priority,
          category: parsedTask.category,
          status: 'deferred',
          alignment_score: 0,
          pushback_reason: 'Deferred — 40-hour killswitch active. Will resurface next week.',
          due_date: parsedTask.due_date ? new Date(parsedTask.due_date) : undefined,
          estimated_hours: parsedTask.estimated_hours || undefined,
          user_id: userId,
          created_from_message_sid: sid,
        });

        confirmations.push(`Saved "${parsedTask.title}" — deferred until killswitch resets`);
        if (!warnings.includes(killcheck.message)) {
          warnings.push(killcheck.message);
        }
        continue;
      }
    }

    // Validate task against goals
    console.log(`🎯 Validating "${parsedTask.title}" against goals...`);
    const validation = await taskValidatorService.validate(parsedTask, userId);
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
        user_id: userId,
        created_from_message_sid: sid,
      });

      confirmations.push(`"${parsedTask.title}" — ${clarificationMsg}`);
      continue;
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
        user_id: userId,
        created_from_message_sid: sid,
      });

      confirmations.push(pushbackMsg);
      continue;
    }

    // Task is valid — create it
    let conflictWarning = '';
    const accountId = await getAccountIdForCategory(parsedTask.category, userId);

    if (parsedTask.due_date && parsedTask.estimated_hours && accountId) {
      const dueDate = new Date(parsedTask.due_date);
      const endTime = new Date(dueDate.getTime() + parsedTask.estimated_hours * 60 * 60 * 1000);

      try {
        const conflict = await calendarService.checkConflicts(accountId, dueDate, endTime);
        if (conflict.hasConflict) {
          const conflictCount = conflict.conflicts.length;
          const conflictSummary = conflict.conflicts[0].title || 'event';
          conflictWarning = ` ⚠️ Conflict: ${conflictCount} event(s) at that time (${conflictSummary})`;
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
      created_from_message_sid: sid,
      account_id: accountId,
      user_id: userId,
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

    // Build per-task confirmation
    const desc = parsedTask.description ? ` — ${parsedTask.description}` : '';
    let line = `${parsedTask.title} [${parsedTask.category}]${desc}${conflictWarning}`;

    if (validation.alignmentScore < 0.7 && validation.reasoning) {
      line += ` (Heads up: ${validation.reasoning})`;
    }

    confirmations.push(line);

    if (parsedTask.category === 'lyra' || parsedTask.category === 'work') {
      const killcheck = await killswitchService.shouldBlockLyraTask(userId);
      if (killcheck.message && !warnings.includes(killcheck.message)) {
        warnings.push(killcheck.message);
      }
    }
  }

  // Build final response
  let response: string;
  if (confirmations.length === 1) {
    response = `Got it! Added: ${confirmations[0]}`;
  } else {
    response = `Got it! Added ${confirmations.length} tasks:\n${confirmations.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
  }

  if (warnings.length > 0) {
    response += `\n\n${warnings.join('\n')}`;
  }

  return { response, messageType: 'task' };
}

/**
 * Handle goal-related messages in chat.
 * If user has no goals, prompt onboarding.
 * If user describes goals for a category, generate and save them.
 */
async function handleGoalOnboarding(body: string, userId?: string): Promise<string> {
  if (!userId) {
    return "I'd love to help you set up goals! Please log in first so I can save them for you.";
  }

  const existingGoals = await goalRepository.findAll(userId);

  // Get user's categories
  const catResult = await pool.query(
    'SELECT name FROM categories WHERE user_id = $1 ORDER BY sort_order ASC',
    [userId]
  );
  const categories = catResult.rows.map((r: { name: string }) => r.name);
  const categoryList = categories.length > 0 ? categories.join(', ') : 'work, personal, home';

  const lower = body.toLowerCase().trim();

  // If they just said "goals" or "set up my goals", give them the intro
  if (lower === 'goals' || lower.includes('set up') || lower.includes('onboarding') || existingGoals.length === 0) {
    const intro = existingGoals.length === 0
      ? `Let's set up your goals! I'll help you create measurable goals for each area of your life.`
      : `You have ${existingGoals.length} goals set up. Want to add more?`;

    return `${intro}\n\nTell me what you want to achieve in one of your areas: ${categoryList}.\n\nFor example: "For work, I want to get promoted to senior engineer by end of year" or "For personal, I want to run a half marathon."\n\nThink about outcomes you can measure — results that lead to a larger objective.`;
  }

  // Otherwise, they're describing goals — use Claude to generate them
  // Try to detect which category they're talking about
  let detectedCategory = '';
  for (const cat of categories) {
    if (lower.includes(`for ${cat}`) || lower.includes(`${cat}:`)) {
      detectedCategory = cat;
      break;
    }
  }

  // Ask Claude to generate goals
  try {
    const result = await claudeService.completeJSON<{
      category: string;
      goals: Array<{
        title: string;
        description: string;
        success_criteria: string;
        target_date: string;
        priority: number;
        milestones: string[];
      }>;
    }>(
      `The user wants to set goals. Their available categories are: ${categoryList}.
${detectedCategory ? `They are talking about the "${detectedCategory}" category.` : 'Detect which category they mean from their message.'}

User's message: "${body}"

Generate 1-3 SMART goals based on what they said. Each goal should be:
- Specific and measurable
- Have a clear target date (YYYY-MM-DD format, within the next 12 months from today, February 2026)
- Include 2-4 concrete milestones that are stepping stones to the goal

Return JSON:
{
  "category": "the category name",
  "goals": [
    {
      "title": "Clear, specific goal title",
      "description": "What this goal means and why it matters",
      "success_criteria": "How they'll know they achieved it — specific metrics or outcomes",
      "target_date": "YYYY-MM-DD",
      "priority": 1,
      "milestones": ["First milestone", "Second milestone", "Third milestone"]
    }
  ]
}`,
      'You are Kathy Koko, an AI Chief of Staff. Generate ambitious but achievable goals focused on measurable outcomes, not activities. Keep titles concise.',
      1024
    );

    // Save the generated goals
    const savedGoals = [];
    for (const g of result.goals) {
      const embedding = await embeddingsService.generateEmbedding(`${g.title}. ${g.description}`);
      const goal = await goalRepository.create({
        title: g.title,
        description: g.description,
        category: result.category,
        priority: g.priority,
        target_date: new Date(g.target_date),
        success_criteria: g.success_criteria,
        embedding,
        user_id: userId,
      });

      for (let i = 0; i < g.milestones.length; i++) {
        await goalMilestoneRepository.create(goal.id, g.milestones[i], i);
      }

      savedGoals.push(g);
    }

    // Format response
    let response = `Great! I've created ${savedGoals.length} goal${savedGoals.length > 1 ? 's' : ''} for ${result.category}:\n\n`;
    savedGoals.forEach((g, i) => {
      response += `${i + 1}. ${g.title}\n`;
      response += `   Target: ${new Date(g.target_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}\n`;
      response += `   Milestones:\n`;
      g.milestones.forEach(m => {
        response += `   - ${m}\n`;
      });
      response += '\n';
    });

    response += `Check the Goals tab to see them! Want to set goals for another area? (${categoryList})`;
    return response;
  } catch (error) {
    console.error('Goal generation error:', error);
    return "I had trouble generating goals from that. Can you try describing what you want to achieve in a specific area? For example: \"For work, I want to...\"";
  }
}

export const chatProcessingService = { classifyMessage, processMessage };
