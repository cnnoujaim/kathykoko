import { claudeService } from '../ai/claude.service';
import { ParsedTask } from '../../types/task.types';

export class MessageParserService {
  /**
   * Parse incoming SMS into structured task using Claude
   */
  async parse(rawSMS: string): Promise<ParsedTask> {
    // Get current date/time in Eastern timezone (server may run in UTC)
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); // YYYY-MM-DD
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Los_Angeles' });
    const currentDateTime = now.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const prompt = `Parse this SMS into a structured task. Return ONLY valid JSON, no markdown.

CURRENT DATE/TIME: ${currentDateTime} (Pacific Time)
Today is: ${currentDay}, ${currentDate}

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
- Default priority: "medium"
- Parse relative dates based on the CURRENT DATE above (e.g., "tomorrow" = the day after ${currentDate})`;

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
