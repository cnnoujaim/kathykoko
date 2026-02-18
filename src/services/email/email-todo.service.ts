import { claudeService } from '../ai/claude.service';
import { emailRepository, Email } from '../../repositories/email.repository';
import { taskRepository } from '../../repositories/task.repository';
import { pool } from '../../config/database';

interface ExtractedTodo {
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  category: 'lyra' | 'music' | 'personal' | 'house';
  source_description: string;
}

/**
 * Extracts actionable tasks from emails using Claude.
 * Runs as part of the email scan and on-demand via chat.
 */
export class EmailTodoService {
  /**
   * Extract todos from a batch of emails and create tasks.
   * Skips emails that have already been processed for todos.
   */
  async extractTodos(emails: Email[]): Promise<{ created: number; items: string[] }> {
    let created = 0;
    const items: string[] = [];

    for (const email of emails) {
      // Skip already-processed emails (check if task exists with this email source)
      const existingTask = await pool.query(
        `SELECT id FROM tasks WHERE created_from_message_sid = $1 LIMIT 1`,
        [`email-${email.gmail_message_id}`]
      );
      if (existingTask.rows.length > 0) continue;

      try {
        const todos = await this.analyzeEmail(email);
        if (todos.length === 0) continue;

        // Get account type for category inference
        const accountResult = await pool.query(
          `SELECT account_type FROM user_accounts WHERE id = $1`,
          [email.account_id]
        );
        const accountType = accountResult.rows[0]?.account_type || 'personal';

        for (const todo of todos) {
          // Check for duplicate by similar title
          const similar = await taskRepository.findByTitleLike(todo.title, 1);
          if (similar.length > 0) {
            console.log(`⏭️  Skipping duplicate todo: "${todo.title}"`);
            continue;
          }

          // Override category based on account type if not explicitly set
          const category = todo.category || this.categoryFromAccountType(accountType);

          await taskRepository.create({
            raw_text: `[Email] From: ${email.from_address} - ${email.subject}`,
            parsed_title: todo.title,
            description: todo.source_description || '',
            priority: todo.priority || 'medium',
            category,
            status: 'pending',
            alignment_score: 0.7, // Email todos are generally relevant
            account_id: email.account_id,
            created_from_message_sid: `email-${email.gmail_message_id}`,
          });

          created++;
          items.push(`${todo.title} [${category}]`);
          console.log(`✓ Email todo created: "${todo.title}" from "${email.subject}"`);
        }
      } catch (error) {
        console.error(`Failed to extract todos from "${email.subject}":`, error);
      }
    }

    return { created, items };
  }

  /**
   * Scan recent unprocessed emails and return a chat-friendly summary.
   */
  async scanAndReport(): Promise<string> {
    // Get recent emails from last 3 days that haven't been processed for todos
    const recentEmails = await pool.query(
      `SELECT e.* FROM emails e
       WHERE e.received_at >= NOW() - INTERVAL '3 days'
         AND e.is_read = false
         AND NOT EXISTS (
           SELECT 1 FROM tasks t WHERE t.created_from_message_sid = 'email-' || e.gmail_message_id
         )
       ORDER BY e.received_at DESC
       LIMIT 20`
    );

    if (recentEmails.rows.length === 0) {
      return "No new emails with action items. You're all caught up!";
    }

    const result = await this.extractTodos(recentEmails.rows);

    if (result.created === 0) {
      return "Scanned your recent emails — no new action items found.";
    }

    const itemList = result.items
      .map((item, i) => `${i + 1}. ${item}`)
      .join('\n');

    return `Found ${result.created} action item${result.created > 1 ? 's' : ''} from your emails:\n${itemList}`;
  }

  /**
   * Use Claude to extract actionable items from a single email.
   */
  private async analyzeEmail(email: Email): Promise<ExtractedTodo[]> {
    const prompt = `Analyze this email and extract actionable items the recipient needs to do.

From: ${email.from_address}
Subject: ${email.subject}
Preview: ${email.body_preview || email.snippet}

Extract action items like:
- Reply/respond to the sender about something specific
- RSVP to an event or confirm attendance
- Make a return or process a refund
- Pay a bill or invoice
- Schedule or book something
- Follow up on a request
- Review/sign a document
- Submit something by a deadline

Do NOT create todos for:
- Newsletters or marketing emails
- Automated notifications (shipping updates, receipts, password resets)
- FYI/informational emails with no action needed
- Emails that are just confirmations

Return a JSON array of action items. Return [] if no action needed:
[{"title": "concise action (max 80 chars)", "priority": "urgent|high|medium|low", "category": "lyra|music|personal|house", "source_description": "brief context from email"}]`;

    try {
      const result = await claudeService.completeJSON<ExtractedTodo[]>(
        prompt,
        'You extract actionable todos from emails. Return only a valid JSON array.',
        512
      );

      // Ensure we got an array
      if (!Array.isArray(result)) return [];
      return result;
    } catch {
      return [];
    }
  }

  private categoryFromAccountType(accountType: string): 'lyra' | 'music' | 'personal' | 'house' {
    const map: Record<string, 'lyra' | 'music' | 'personal' | 'house'> = {
      lyra: 'lyra',
      music: 'music',
      personal: 'personal',
    };
    return map[accountType] || 'personal';
  }
}

export const emailTodoService = new EmailTodoService();
