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

export type MessageType = 'query' | 'task' | 'killswitch' | 'action' | 'checkin' | 'email_scan' | 'goals' | 'conversation';

export interface ChatResponse {
  response: string;
  messageType: MessageType;
}

/**
 * Classify a message into one of: query, task, killswitch, action.
 * Uses fast keyword matching first, then Claude for ambiguous cases.
 */
export async function classifyMessage(body: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []): Promise<MessageType> {
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

  // Fast path: brainstorming / conversation
  if (
    lower.includes('brainstorm') ||
    lower.includes('ideas for') ||
    lower.includes('help me think') ||
    lower.includes('let\'s think') ||
    lower.includes('let\'s discuss') ||
    lower.includes('what do you think') ||
    lower.includes('what would you suggest') ||
    lower.includes('any suggestions') ||
    lower.includes('give me ideas') ||
    lower.includes('pros and cons') ||
    lower.includes('help me decide') ||
    lower.includes('better way to') ||
    lower.includes('advice on') ||
    lower.includes('how should i approach') ||
    lower.includes('let\'s plan')
  ) {
    return 'conversation';
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

  // Ambiguous: use Claude to classify (include recent history for context)
  try {
    const historyContext = history.length > 0
      ? `\nRECENT CONVERSATION:\n${history.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n')}\n`
      : '';

    const classification = await claudeService.completeJSON<{ type: 'query' | 'task' | 'action' | 'goals' | 'conversation' }>(
      `Classify this message into one of these types:
- "query": asking a factual question about schedule, calendar, tasks, or status
- "conversation": brainstorming, discussing ideas, asking for advice or suggestions, general discussion, thinking through a problem together
- "task": requesting to create something new (a new task, reminder, etc.)
- "action": managing an existing task or calendar event (mark done, delete, edit, reschedule, cancel, reprioritize)
- "goals": setting up, describing, or discussing goals
${historyContext}
MESSAGE: "${body}"

Consider the conversation context when classifying. For example, "yes" after a question about goals should be "goals", a follow-up to a brainstorm should be "conversation", and a factual question should be "query".

Return JSON: {"type": "query"} or {"type": "conversation"} or {"type": "task"} or {"type": "action"} or {"type": "goals"}`,
      'You classify messages. Return only valid JSON.',
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
export async function processMessage(body: string, messageSid?: string, userId?: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []): Promise<ChatResponse> {
  // Check if this is a response to a pending evening check-in
  const pendingCheckin = await healthCheckinRepository.findPendingResponse();
  if (pendingCheckin) {
    const response = await eveningCheckinService.processResponse(body);
    return { response, messageType: 'checkin' };
  }

  // Classify message (pass history for context-aware classification)
  const messageType = await classifyMessage(body, history);
  console.log(`📋 Message classified as: ${messageType}`);

  if (messageType === 'killswitch') {
    const response = await killswitchService.formatStatusMessage();
    return { response, messageType: 'killswitch' };
  }

  if (messageType === 'query') {
    const response = await queryService.answer(body, history);
    return { response, messageType: 'query' };
  }

  if (messageType === 'conversation') {
    const response = await queryService.answer(body, history, 'conversation');
    return { response, messageType: 'conversation' };
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
    const response = await handleGoalOnboarding(body, userId, history);
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

    if (validation.alignmentScore < 0.3) {
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

    if (parsedTask.due_date && parsedTask.estimated_hours && userId) {
      const dueDate = new Date(parsedTask.due_date);
      const durationMinutes = parsedTask.estimated_hours * 60;
      const endTime = new Date(dueDate.getTime() + durationMinutes * 60 * 1000);

      try {
        // Cross-account conflict check
        const conflict = await calendarService.checkConflictsForUser(userId, dueDate, endTime);
        if (conflict.hasConflict) {
          const conflictCount = conflict.conflicts.length;
          const conflictSummary = conflict.conflicts[0].title || 'event';
          conflictWarning = `\n⚠️ Conflict: ${conflictCount} event(s) overlap (${conflictSummary})`;

          // Suggest available slots
          try {
            const slots = await calendarService.findAvailableSlots(userId, durationMinutes, dueDate, 3);
            if (slots.length > 0) {
              conflictWarning += '\nHere are some open slots:';
              slots.forEach(slot => {
                conflictWarning += `\n  • ${slot.label}`;
              });
            }
          } catch (slotError) {
            console.error('Slot suggestion failed:', slotError);
          }
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

    if (validation.alignmentScore < 0.5 && validation.reasoning) {
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
 * Short messages get the intro prompt.
 * Detailed messages get parsed into goals across multiple categories.
 */
async function handleGoalOnboarding(body: string, userId?: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []): Promise<string> {
  if (!userId) {
    return "I'd love to help you set up goals! Please log in first so I can save them for you.";
  }

  // Get user's categories
  const catResult = await pool.query(
    'SELECT name FROM categories WHERE user_id = $1 ORDER BY sort_order ASC',
    [userId]
  );
  const categories = catResult.rows.map((r: { name: string }) => r.name);
  const categoryList = categories.length > 0 ? categories.join(', ') : 'work, personal, home';

  const lower = body.toLowerCase().trim();

  // Short messages = show intro prompt. Long messages = they're providing actual goals.
  const isShortMessage = body.length < 100;
  if (isShortMessage && (lower === 'goals' || lower.includes('set up') || lower.includes('help') || lower.includes('onboarding'))) {
    const existingGoals = await goalRepository.findAll(userId);
    const intro = existingGoals.length === 0
      ? `Let's set up your goals! I'll help you create measurable goals for each area of your life.`
      : `You have ${existingGoals.length} goals set up. Want to add more?`;

    return `${intro}\n\nTell me what you want to achieve — you can describe goals for one area or paste in all your goals at once. Your categories: ${categoryList}.\n\nFor example: "For work, I want to get promoted to senior engineer by end of year"\n\nThink about outcomes you can measure — results that lead to a larger objective.`;
  }

  // Detailed message — parse goals across all categories using Claude
  try {
    const historyContext = history.length > 0
      ? `\nPrevious conversation:\n${history.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n')}\n`
      : '';

    const result = await claudeService.completeJSON<{
      categories: Array<{
        category: string;
        goals: Array<{
          title: string;
          description: string;
          success_criteria: string;
          target_date: string;
          priority: number;
          milestones: string[];
        }>;
      }>;
    }>(
      `The user is describing their goals. Parse their input into structured goals grouped by category.

The user's available categories are: ${categoryList}.
Map each goal to the best-fitting category. If a goal doesn't fit any existing category, use the closest match.
${historyContext}
User's latest input:
"${body}"

For each goal mentioned, extract:
- A concise title
- Description of what it means
- Measurable success criteria
- Target date (YYYY-MM-DD format — use the dates they mention, or reasonable defaults within 2026)
- Priority (1=highest, 3=lowest)
- 2-4 concrete milestones

Return JSON:
{
  "categories": [
    {
      "category": "work",
      "goals": [
        {
          "title": "Concise goal title",
          "description": "What this goal means",
          "success_criteria": "How to measure success",
          "target_date": "2026-12-31",
          "priority": 1,
          "milestones": ["Step 1", "Step 2", "Step 3"]
        }
      ]
    }
  ]
}`,
      'You are Kathy Koko, an AI Chief of Staff. Extract ALL goals the user described — do not summarize or reduce them. Preserve their specific metrics and dates. Keep titles concise but descriptive.',
      4096
    );

    // Save all goals across all categories
    let totalSaved = 0;
    const summaryParts: string[] = [];

    for (const cat of result.categories) {
      const goalTitles: string[] = [];

      for (const g of cat.goals) {
        const embedding = await embeddingsService.generateEmbedding(`${g.title}. ${g.description}`);
        const goal = await goalRepository.create({
          title: g.title,
          description: g.description,
          category: cat.category,
          priority: g.priority,
          target_date: new Date(g.target_date),
          success_criteria: g.success_criteria,
          embedding,
          user_id: userId,
        });

        for (let i = 0; i < g.milestones.length; i++) {
          await goalMilestoneRepository.create(goal.id, g.milestones[i], i);
        }

        goalTitles.push(g.title);
        totalSaved++;
      }

      const catName = cat.category.charAt(0).toUpperCase() + cat.category.slice(1);
      summaryParts.push(`${catName}: ${goalTitles.map((t, i) => `${i + 1}. ${t}`).join(', ')}`);
    }

    let response = `Done! I've saved ${totalSaved} goals across ${result.categories.length} areas:\n\n`;
    response += summaryParts.join('\n\n');
    response += '\n\nCheck the Goals tab to see them all with milestones and progress tracking!';

    return response;
  } catch (error) {
    console.error('Goal generation error:', error);
    return "I had trouble processing all those goals. Try sending them in smaller chunks — one area at a time. For example, start with your work goals.";
  }
}

export const chatProcessingService = { classifyMessage, processMessage };
