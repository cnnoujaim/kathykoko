import { claudeService } from '../ai/claude.service';
import { ParsedTask } from '../../types/task.types';

export class MessageParserService {
  /**
   * Parse incoming SMS into one or more structured tasks using Claude.
   * A single message like "Book studio time and call the contractor" becomes two tasks.
   */
  async parse(rawSMS: string): Promise<ParsedTask[]> {
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
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

    const prompt = `Parse this SMS into structured task(s). If the message contains multiple distinct tasks, return ALL of them. Return ONLY valid JSON, no markdown.

CURRENT DATE/TIME: ${currentDateTime} (Pacific Time)
Today is: ${currentDay}, ${currentDate}

SMS: "${rawSMS}"

Return a JSON array of tasks. Even if there's only one task, wrap it in an array:
[
  {
    "title": "short, actionable title (max 60 chars)",
    "description": "fuller context — who, what, why, any details from the message. 1-2 sentences.",
    "priority": "urgent|high|medium|low",
    "category": "lyra|music|personal|house",
    "due_date": "YYYY-MM-DD if mentioned, otherwise null",
    "estimated_hours": number if mentioned, otherwise null
  }
]

Rules:
- Title should be SHORT and scannable (e.g. "Book studio time" not "Book studio time tomorrow for recording session")
- Description should capture the details (e.g. "Tomorrow's session for Persephone vocal tracking")
- If SMS mentions "work", "Lyra", "meeting", "architecture" → category: "lyra"
- If SMS mentions "studio", "music", "song", "Persephone", "gig" → category: "music"
- If SMS mentions "contractor", "house", "Guest Room", "renovation" → category: "house"
- Otherwise → category: "personal"
- If SMS uses words like "ASAP", "urgent", "now", "today" → priority: "urgent"
- If SMS mentions a deadline → priority: "high"
- Default priority: "medium"
- Parse relative dates based on the CURRENT DATE above (e.g., "tomorrow" = the day after ${currentDate})
- If one message has multiple tasks (e.g. "Book studio and call contractor"), return EACH as a separate item`;

    const systemPrompt = `You are Kathy Koko's SMS parser. Parse user messages into structured tasks.
Always return a valid JSON array. Be concise but include helpful descriptions.`;

    try {
      const parsed = await claudeService.completeJSON<ParsedTask[]>(
        prompt,
        systemPrompt,
        1024
      );

      // Handle both array and single-object responses
      const tasks = Array.isArray(parsed) ? parsed : [parsed];

      return tasks.map(t => ({
        title: t.title || rawSMS.substring(0, 60),
        description: t.description || '',
        priority: t.priority || 'medium',
        category: t.category || 'personal',
        due_date: t.due_date || undefined,
        estimated_hours: t.estimated_hours || undefined,
      }));
    } catch (error) {
      console.error('Failed to parse SMS with Claude:', error);

      return [{
        title: rawSMS.substring(0, 60),
        priority: 'medium',
        category: 'personal',
        due_date: undefined,
      }];
    }
  }
}

export const messageParserService = new MessageParserService();
