import { claudeService } from '../ai/claude.service';
import { emailRepository, Email } from '../../repositories/email.repository';
import { gmailService } from './gmail.service';
import { ghostwriterService } from './ghostwriter.service';
import { smsService } from '../sms/sms.service';
import { config } from '../../config';
import { pool } from '../../config/database';

interface ScanResult {
  synced: number;
  urgent: number;
  drafted: number;
}

export class EmailScannerService {
  /**
   * Full scan: sync emails from Gmail, detect urgency, auto-draft for urgent ones
   */
  async fullScan(): Promise<ScanResult> {
    // Get all connected accounts
    const accounts = await pool.query(
      `SELECT ua.id, ua.account_type, ua.email FROM user_accounts ua
       JOIN oauth_tokens ot ON ua.id = ot.account_id
       WHERE ot.provider = 'google'`
    );

    let totalSynced = 0;
    let totalUrgent = 0;
    let totalDrafted = 0;

    for (const account of accounts.rows) {
      try {
        // 1. Sync emails from Gmail
        const synced = await gmailService.syncEmails(account.id, 15);
        totalSynced += synced;

        if (synced === 0) continue;

        // 2. Detect urgency on new emails
        const recentEmails = await emailRepository.findByAccountId(account.id, synced);
        for (const email of recentEmails) {
          if (email.is_urgent) continue; // Already processed

          const urgency = await this.assessUrgency(email, account.account_type);
          if (urgency.isUrgent) {
            await emailRepository.markUrgent(email.id, urgency.reason);
            totalUrgent++;

            // 3. Auto-draft for urgent emails
            if (!email.has_draft) {
              try {
                await ghostwriterService.generateDraft(email);
                totalDrafted++;
              } catch (error) {
                console.error(`Failed to auto-draft for "${email.subject}":`, error);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Email scan failed for account ${account.email}:`, error);
      }
    }

    // 4. Notify via SMS if there are urgent emails
    if (totalUrgent > 0) {
      const urgentEmails = await emailRepository.findUrgentUnread();
      const summary = urgentEmails.slice(0, 3).map((e) =>
        `- ${e.from_address}: "${e.subject}"`
      ).join('\n');

      const message = `📬 ${totalUrgent} urgent email(s) need attention:\n${summary}${urgentEmails.length > 3 ? `\n...and ${urgentEmails.length - 3} more` : ''}\n\nDrafts ready. Text "emails" to review.`;

      await smsService.sendSMS(config.kathyPhoneNumber, message);
    }

    console.log(`📧 Email scan: ${totalSynced} synced, ${totalUrgent} urgent, ${totalDrafted} drafted`);
    return { synced: totalSynced, urgent: totalUrgent, drafted: totalDrafted };
  }

  /**
   * Assess urgency of an email using Claude
   */
  private async assessUrgency(
    email: Email,
    accountType: string
  ): Promise<{ isUrgent: boolean; reason: string }> {
    const prompt = `Assess if this email needs a response within 24 hours.

ACCOUNT TYPE: ${accountType}
FROM: ${email.from_address}
SUBJECT: ${email.subject}
SNIPPET: ${email.snippet}

Consider urgent if:
- Direct question requiring a response
- Meeting/event RSVP or scheduling request
- Work request from manager or team (if lyra account)
- Booking/venue inquiry (if music account)
- Contractor quote, scheduling, or deadline (if personal)
- Time-sensitive request or deadline mentioned

NOT urgent if:
- Newsletter, marketing, promotional
- Automated notifications (GitHub, Jira, etc.)
- CC'd/FYI emails with no action needed
- Social media notifications
- Receipts or confirmations

Return JSON: {"isUrgent": true/false, "reason": "brief reason"}`;

    try {
      const result = await claudeService.completeJSON<{ isUrgent: boolean; reason: string }>(
        prompt,
        'You assess email urgency. Return only valid JSON.',
        128
      );
      return result;
    } catch {
      return { isUrgent: false, reason: '' };
    }
  }
}

export const emailScannerService = new EmailScannerService();
