import { claudeService } from '../ai/claude.service';
import { ParsedTask } from '../../types/task.types';

export class MessageParserService {
  /**
   * Parse incoming SMS into structured task using Claude
   */
  async parse(rawSMS: string): Promise<ParsedTask> {
    const prompt = `Parse this SMS into a structured task. Return ONLY valid JSON, no markdown.

SMS: "${rawSMS}"

Return JSON with this exact structure:
{
  "title": "brief task title (max 100 chars)",
  "description": "details if any, otherwise empty string",
  "priority": "urgent|high|medium|low",
  "category": "lyra|music|personal|house",
  "due_date": "ISO date string (YYYY-MM-DD) if mentioned, otherwise null",
  "estimated_hours": number if work hours mentioned, otherwise null
}

Rules:
- If SMS mentions "work", "Lyra", "meeting", "architecture" → category: "lyra"
- If SMS mentions "studio", "music", "song", "Persephone", "gig" → category: "music"
- If SMS mentions "contractor", "house", "Guest Room", "renovation" → category: "house"
- Otherwise → category: "personal"
- If SMS uses words like "ASAP", "urgent", "now", "today" → priority: "urgent"
- If SMS mentions a deadline → priority: "high"
- Default priority: "medium"`;

    const systemPrompt = `You are Kathy Koko's SMS parser. Parse user messages into structured tasks.
Always return valid JSON. Be concise. Infer context from keywords.`;

    try {
      const parsed = await claudeService.completeJSON<ParsedTask>(
        prompt,
        systemPrompt,
        512
      );

      return {
        title: parsed.title || rawSMS.substring(0, 100),
        description: parsed.description || '',
        priority: parsed.priority || 'medium',
        category: parsed.category || 'personal',
        due_date: parsed.due_date || undefined,
        estimated_hours: parsed.estimated_hours || undefined,
      };
    } catch (error) {
      console.error('Failed to parse SMS with Claude:', error);

      // Fallback: Basic parsing if Claude fails
      return {
        title: rawSMS.substring(0, 100),
        priority: 'medium',
        category: 'personal',
        due_date: undefined,
      };
    }
  }
}

export const messageParserService = new MessageParserService();
