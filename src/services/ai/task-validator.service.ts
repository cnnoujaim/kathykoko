import { ParsedTask, ValidationResult } from '../../types/task.types';
import { embeddingsService } from './embeddings.service';
import { goalRepository } from '../../repositories/goal.repository';
import { claudeService } from './claude.service';

export class TaskValidatorService {
  /**
   * Validate a task against 2026 cultivation goals
   */
  async validate(task: ParsedTask): Promise<ValidationResult> {
    try {
      // 1. Generate embedding for the task
      const taskText = `${task.title}. ${task.description || ''}`;
      const taskEmbedding = await embeddingsService.generateEmbedding(taskText);

      // 2. Find similar goals using vector search
      const similarGoals = await goalRepository.findSimilar(taskEmbedding, 3);

      if (similarGoals.length === 0) {
        // No goals in database yet
        return {
          alignmentScore: 0.5,
          needsClarification: false,
          reasoning: 'No goals found in database. Please run npm run seed to load goals.',
          isValid: true,
        };
      }

      // 3. Use Claude to determine alignment and generate reasoning
      const goalsContext = similarGoals
        .map((g) => `- ${g.title} (similarity: ${(g.similarity * 100).toFixed(1)}%)`)
        .join('\n');

      const prompt = `You are Kathy Koko, an AI Chief of Staff helping a triple-threat user: Senior MLE (Lyra), Independent Musician (Persephone album), and Homeowner (The Sanctuary).

Evaluate this task against the user's 2026 "BLOOM" goals:

**Task:** ${task.title}
**Description:** ${task.description || 'No description provided'}
**Category:** ${task.category}

**Most Similar Goals:**
${goalsContext}

**2026 Goals Theme:** BLOOM - Tending to roots to support the bloom. Focus on completing the Persephone album, maintaining 40-hour work weeks at Lyra, building health/performance stamina, and completing home renovations by July 1.

Return JSON:
{
  "alignmentScore": 0.0-1.0,
  "needsClarification": true/false,
  "clarificationPrompt": "question to ask if unclear (or null)",
  "reasoning": "1-2 sentence explanation of alignment or why it's low-value",
  "isValid": true/false
}

**Scoring Guide:**
- 0.8-1.0: Directly advances a P1 goal (album completion, 40-hr cap, July 1 deadline)
- 0.5-0.7: Supports a goal but not critical path
- 0.0-0.4: Low value, distraction, or busywork

**Pushback Philosophy:** Kathy is ruthless about protecting time for what matters. If a task doesn't clearly advance album, health, or July 1 renovations, score it low.`;

      const response = await claudeService.completeJSON<{
        alignmentScore: number;
        needsClarification: boolean;
        clarificationPrompt?: string;
        reasoning: string;
        isValid: boolean;
      }>(prompt, 'You are Kathy Koko. Ruthlessly protect the user\'s time and goals.', 512);

      return {
        alignmentScore: response.alignmentScore,
        needsClarification: response.needsClarification,
        clarificationPrompt: response.clarificationPrompt,
        reasoning: response.reasoning,
        isValid: response.isValid,
      };
    } catch (error) {
      console.error('Task validation error:', error);

      // Fallback: Allow task but flag for manual review
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
