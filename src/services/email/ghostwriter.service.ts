import { claudeService } from '../ai/claude.service';
import { emailDraftRepository, CreateDraftInput } from '../../repositories/email-draft.repository';
import { emailRepository, Email } from '../../repositories/email.repository';
import { pool } from '../../config/database';

type Persona = 'lyra' | 'music' | 'contractor';

interface PersonaConfig {
  name: string;
  role: string;
  tone: string;
  signature: string;
  systemPrompt: string;
}

const PERSONAS: Record<Persona, PersonaConfig> = {
  lyra: {
    name: 'Cristina Noujaim',
    role: 'Senior MLE at Lyra',
    tone: 'Professional, competent, concise. Warm but efficient.',
    signature: 'Best,\nCristina',
    systemPrompt: `You are ghostwriting emails for Cristina Noujaim, a Senior Machine Learning Engineer at Lyra.
She is competent, respected, and maintains strict work-life boundaries (40 hrs/week max).
Write professionally and concisely. Action-oriented, no fluff.
Never over-commit her time. If the email involves scheduling, suggest reasonable timeframes.
Match the formality of the incoming email. She is polished and direct.`,
  },
  music: {
    name: 'Cristina Noujaim',
    role: 'Professional singer-songwriter and recording artist',
    tone: 'Professional, polished, confident. Warm but business-minded.',
    signature: 'Best,\nCristina Noujaim',
    systemPrompt: `You are ghostwriting emails for Cristina Noujaim, a professional singer-songwriter and recording artist.
Her professional email is hello@cristinanoujaim.com. She is currently recording her debut album "Persephone."
She performs regularly at Sofar Sounds and is building a serious music career alongside her tech career.

IMPORTANT TONE GUIDELINES:
- Write professionally. This is her business correspondence as an artist.
- She is confident and established, not eager or overly enthusiastic.
- Keep it warm but polished — she's a professional, not a fan.
- For venue/booking emails: gracious, appreciative, but businesslike. She knows her worth.
- For industry contacts: collegial, professional, concise.
- For collaboration requests: open-minded but discerning about creative fit.
- NEVER use overly casual language like "xo", excessive exclamation marks, or gushing.
- She is a working artist who takes her craft and her business seriously.`,
  },
  contractor: {
    name: 'Cristina Noujaim',
    role: 'Homeowner managing Guest Room and Home Studio renovation',
    tone: 'Professional, friendly, clear expectations. Organized and direct.',
    signature: 'Thank you,\nCristina',
    systemPrompt: `You are ghostwriting emails for Cristina Noujaim, a homeowner managing renovations.
She's building a Guest Room and Home Studio (with sound treatment) with a July 1 deadline.
She also hosts monthly social gatherings and quarterly creative mixers.
Write professionally and clearly. Set firm expectations on timelines and quality.
She's organized and expects contractors/vendors to be professional and on-time.
For social/event emails: warm and inviting, but organized with clear details.`,
  },
};

export class GhostwriterService {
  /**
   * Determine the appropriate persona based on account type and email context
   */
  inferPersona(accountType: string, email: Email): Persona {
    // Direct mapping from account type
    if (accountType === 'lyra') return 'lyra';
    if (accountType === 'music') return 'music';

    // For personal accounts, infer from email content
    const lower = (email.subject + ' ' + email.snippet).toLowerCase();

    if (
      lower.includes('contractor') || lower.includes('renovation') ||
      lower.includes('install') || lower.includes('quote') ||
      lower.includes('estimate') || lower.includes('plumbing') ||
      lower.includes('electric') || lower.includes('studio build') ||
      lower.includes('sound treatment') || lower.includes('guest room')
    ) {
      return 'contractor';
    }

    if (
      lower.includes('music') || lower.includes('song') ||
      lower.includes('album') || lower.includes('gig') ||
      lower.includes('sofar') || lower.includes('venue') ||
      lower.includes('booking') || lower.includes('persephone')
    ) {
      return 'music';
    }

    if (
      lower.includes('meeting') || lower.includes('sprint') ||
      lower.includes('deploy') || lower.includes('standup') ||
      lower.includes('jira') || lower.includes('pr review') ||
      lower.includes('ml') || lower.includes('model')
    ) {
      return 'lyra';
    }

    // Default to contractor for personal account (home/social stuff)
    return 'contractor';
  }

  /**
   * Generate a draft reply for an email
   */
  async generateDraft(email: Email, persona?: Persona): Promise<string> {
    // Get account type if persona not specified
    if (!persona) {
      const account = await pool.query(
        'SELECT account_type FROM user_accounts WHERE id = $1',
        [email.account_id]
      );
      const accountType = account.rows[0]?.account_type || 'personal';
      persona = this.inferPersona(accountType, email);
    }

    const config = PERSONAS[persona];

    const prompt = `Draft a reply to this email.

FROM: ${email.from_address}
SUBJECT: ${email.subject}
BODY:
${email.body_preview || email.snippet}

---
Write a reply as ${config.name} (${config.role}).
Tone: ${config.tone}
End with: ${config.signature}

Keep it concise. Match the length and formality of the original email. Do NOT include a subject line - just the body text.`;

    const draft = await claudeService.complete(prompt, config.systemPrompt, 1024);

    // Store the draft
    const savedDraft = await emailDraftRepository.create({
      email_id: email.id,
      persona,
      subject: `Re: ${email.subject}`,
      body: draft,
      tone_notes: `Persona: ${persona} | Tone: ${config.tone}`,
    });

    // Mark email as having a draft
    await emailRepository.markHasDraft(email.id, savedDraft.id);

    console.log(`✓ Draft generated for "${email.subject}" as ${persona}`);
    return draft;
  }

  /**
   * Generate drafts for all urgent unread emails
   */
  async generateDraftsForUrgent(): Promise<number> {
    const urgentEmails = await emailRepository.findUrgentUnread();
    let drafted = 0;

    for (const email of urgentEmails) {
      if (email.has_draft) continue;

      try {
        await this.generateDraft(email);
        drafted++;
      } catch (error) {
        console.error(`Failed to draft for "${email.subject}":`, error);
      }
    }

    return drafted;
  }

  /**
   * Format a draft summary for SMS
   */
  formatDraftForSMS(email: Email, draft: string, persona: Persona): string {
    const config = PERSONAS[persona];
    const preview = draft.substring(0, 200);
    return `📧 Draft ready (${config.name}):\nRe: ${email.subject}\n\n${preview}${draft.length > 200 ? '...' : ''}\n\nReply "send" to send, "edit [changes]" to revise.`;
  }
}

export const ghostwriterService = new GhostwriterService();
