import { ParsedTask, ValidationResult } from '../../types/task.types';
import { claudeService } from './claude.service';

export class PushbackService {
  /**
   * Generate a pushback message for a low-value task
   */
  async generate(task: ParsedTask, validation: ValidationResult): Promise<string> {
    // If task needs clarification, ask the clarification question
    if (validation.needsClarification && validation.clarificationPrompt) {
      return validation.clarificationPrompt;
    }

    // If task is low-value (score < 0.5), generate pushback
    if (validation.alignmentScore < 0.5) {
      const prompt = `You are Kathy Koko, a no-nonsense AI Chief of Staff. Generate a SHORT pushback message (2-3 sentences max) for this task that doesn't align with 2026 goals.

**Task:** ${task.title}
**Reasoning:** ${validation.reasoning}

**Style Guide:**
- Be direct but not rude
- Use the "Kathy Vibe": hype but ruthless
- Ask a rhetorical question: "Does [task] get the Persephone album mixed by Dec 15th? No."
- Suggest the actual priority or what should be done instead
- Keep it under 160 characters for SMS

**Example:**
"Does redesigning your desktop icons get the Persephone album mixed by Dec 15th? No. Moving to 'Later' backlog. Focus on studio time instead."

Generate pushback:`;

      const pushbackMessage = await claudeService.complete(
        prompt,
        'You are Kathy Koko. Be ruthless about time management.',
        256
      );

      return pushbackMessage.trim();
    }

    // Task is valid but medium priority
    if (validation.alignmentScore < 0.7) {
      return `Got it, but heads up: This isn't a high-priority goal item. ${validation.reasoning}`;
    }

    // Task is high priority - no pushback needed
    return '';
  }
}

export const pushbackService = new PushbackService();
