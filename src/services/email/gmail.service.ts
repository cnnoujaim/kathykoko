import { google, gmail_v1 } from 'googleapis';
import { oauthService } from '../oauth/oauth.service';
import { emailRepository, CreateEmailInput } from '../../repositories/email.repository';
import { pool } from '../../config/database';

interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string;
  bodyPreview: string;
  labels: string[];
  date: Date;
  isRead: boolean;
}

export class GmailService {
  /**
   * Get authenticated Gmail client for an account
   */
  private async getGmailClient(accountId: string): Promise<gmail_v1.Gmail> {
    const auth = await oauthService.getAuthenticatedClient(accountId);
    return google.gmail({ version: 'v1', auth });
  }

  /**
   * Fetch recent emails from Gmail and sync to local database
   */
  async syncEmails(accountId: string, maxResults: number = 20): Promise<number> {
    const gmail = await this.getGmailClient(accountId);

    // Get recent messages from inbox
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: 'in:inbox -category:promotions -category:social -category:updates',
    });

    const messages = listResponse.data.messages || [];
    let synced = 0;

    for (const msg of messages) {
      if (!msg.id) continue;

      // Skip if already synced
      const existing = await emailRepository.findByGmailId(msg.id);
      if (existing) continue;

      try {
        const parsed = await this.fetchAndParseMessage(gmail, msg.id);
        if (!parsed) continue;

        await emailRepository.upsert({
          gmail_message_id: parsed.id,
          gmail_thread_id: parsed.threadId,
          account_id: accountId,
          from_address: parsed.from,
          to_addresses: parsed.to,
          cc_addresses: parsed.cc,
          subject: parsed.subject,
          snippet: parsed.snippet,
          body_preview: parsed.bodyPreview,
          labels: parsed.labels,
          is_read: parsed.isRead,
          received_at: parsed.date,
        });

        synced++;
      } catch (error) {
        console.error(`Failed to sync message ${msg.id}:`, error);
      }
    }

    console.log(`✓ Synced ${synced} new emails for account ${accountId}`);
    return synced;
  }

  /**
   * Fetch and parse a single Gmail message
   */
  private async fetchAndParseMessage(
    gmail: gmail_v1.Gmail,
    messageId: string
  ): Promise<GmailMessage | null> {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
    });

    const message = response.data;
    if (!message.id || !message.payload?.headers) return null;

    const headers = message.payload.headers;
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    const from = this.parseEmailAddress(getHeader('From'));
    const to = this.parseEmailAddresses(getHeader('To'));
    const cc = this.parseEmailAddresses(getHeader('Cc'));
    const subject = getHeader('Subject');
    const dateStr = getHeader('Date');

    // Get body preview (first ~500 chars of text)
    let bodyPreview = message.snippet || '';
    if (message.payload) {
      const textBody = this.extractTextBody(message.payload);
      if (textBody) {
        bodyPreview = textBody.substring(0, 500);
      }
    }

    return {
      id: message.id,
      threadId: message.threadId || '',
      from,
      to,
      cc,
      subject,
      snippet: message.snippet || '',
      bodyPreview,
      labels: message.labelIds || [],
      date: dateStr ? new Date(dateStr) : new Date(),
      isRead: !(message.labelIds || []).includes('UNREAD'),
    };
  }

  /**
   * Extract plain text body from message payload
   */
  private extractTextBody(payload: gmail_v1.Schema$MessagePart): string {
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        const text = this.extractTextBody(part);
        if (text) return text;
      }
    }

    return '';
  }

  /**
   * Send an email via Gmail
   */
  async sendEmail(
    accountId: string,
    to: string,
    subject: string,
    body: string,
    inReplyTo?: string,
    threadId?: string
  ): Promise<string> {
    const gmail = await this.getGmailClient(accountId);

    // Get sender email
    const account = await pool.query('SELECT email FROM user_accounts WHERE id = $1', [accountId]);
    const fromEmail = account.rows[0]?.email || 'me';

    // Build raw email
    const headers = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
    ];

    if (inReplyTo) {
      headers.push(`In-Reply-To: ${inReplyTo}`);
      headers.push(`References: ${inReplyTo}`);
    }

    const rawEmail = [...headers, '', body].join('\r\n');
    const encoded = Buffer.from(rawEmail).toString('base64url');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encoded,
        threadId: threadId || undefined,
      },
    });

    console.log(`✓ Email sent via ${fromEmail}: ${subject}`);
    return response.data.id || '';
  }

  /**
   * Parse "Name <email@domain.com>" format
   */
  private parseEmailAddress(raw: string): string {
    const match = raw.match(/<([^>]+)>/);
    return match ? match[1] : raw.trim();
  }

  private parseEmailAddresses(raw: string): string[] {
    if (!raw) return [];
    return raw.split(',').map((addr) => this.parseEmailAddress(addr.trim()));
  }
}

export const gmailService = new GmailService();
