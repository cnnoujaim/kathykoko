import { ParsedTask, ValidationResult } from '../../types/task.types';
import { embeddingsService } from './embeddings.service';
import { goalRepository } from '../../repositories/goal.repository';
import { claudeService } from './claude.service';

export class TaskValidatorService {
  /**
   * Validate a task against the user's goals
   */
  async validate(task: ParsedTask, userId?: string): Promise<ValidationResult> {
    try {
      // 1. Generate embedding for the task
      const taskText = `${task.title}. ${task.description || ''}`;
      const taskEmbedding = await embeddingsService.generateEmbedding(taskText);

      // 2. Find similar goals using vector search (scoped to user)
      const similarGoals = await goalRepository.findSimilar(taskEmbedding, 3, userId);

      if (similarGoals.length === 0) {
        return {
          alignmentScore: 0.5,
          needsClarification: false,
          reasoning: 'No goals set yet. Set up your goals to get task alignment scoring.',
          isValid: true,
        };
      }

      // 3. Build dynamic goal context
      const goalsContext = similarGoals
        .map((g) => `- ${g.title} (similarity: ${(g.similarity * 100).toFixed(1)}%)`)
        .join('\n');

      // Get all user goals for high-level context
      const allGoals = await goalRepository.findAll(userId);
      const goalSummary = allGoals
        .filter(g => g.priority <= 2)
        .map(g => `${g.title} [${g.category}]`)
        .join(', ');

      const prompt = `You are Kathy Koko, an AI Chief of Staff. Evaluate this task against the user's goals.

**Task:** ${task.title}
**Description:** ${task.description || 'No description provided'}
**Category:** ${task.category}

**Most Similar Goals:**
${goalsContext}

**User's Top Goals:** ${goalSummary || 'None set'}

Return JSON:
{
  "alignmentScore": 0.0-1.0,
  "needsClarification": true/false,
  "clarificationPrompt": "question to ask if unclear (or null)",
  "reasoning": "1-2 sentence explanation of alignment or why it's low-value",
  "isValid": true/false
}

**Scoring Guide:**
- 0.8-1.0: Directly advances a priority 1 goal
- 0.6-0.8: Supports a goal or is a reasonable life responsibility
- 0.5-0.6: Tangentially related or general life maintenance
- 0.0-0.4: Genuinely harmful to the user's priorities (e.g. taking on someone else's work, obvious time-wasters)

**Philosophy:** The user has a full life — friends, family, errands, and personal obligations are all valid. Only push back on tasks that are genuinely counterproductive or clear distractions from critical goals. Tasks for relationships, health, household, and personal well-being should always be accepted.`;

      const response = await claudeService.completeJSON<{
        alignmentScore: number;
        needsClarification: boolean;
        clarificationPrompt?: string;
        reasoning: string;
        isValid: boolean;
      }>(prompt, 'You are Kathy Koko, a supportive AI Chief of Staff. Accept all reasonable life tasks — only push back on genuinely counterproductive ones.', 512);

      return {
        alignmentScore: response.alignmentScore,
        needsClarification: response.needsClarification,
        clarificationPrompt: response.clarificationPrompt,
        reasoning: response.reasoning,
        isValid: response.isValid,
      };
    } catch (error) {
      console.error('Task validation error:', error);

      return {
        alignmentScore: 0.5,
        needsClarification: false,
        reasoning: 'Validation service error. Task allowed by default.',
        isValid: true,
      };
    }
  }
}

export const taskValidatorService = new TaskValidatorService();
