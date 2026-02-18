import { Request, Response } from 'express';
import { emailRepository } from '../repositories/email.repository';
import { emailDraftRepository } from '../repositories/email-draft.repository';
import { emailScannerService } from '../services/email/email-scanner.service';
import { ghostwriterService } from '../services/email/ghostwriter.service';
import { gmailService } from '../services/email/gmail.service';
import { pool } from '../config/database';

class EmailController {
  /**
   * Trigger a manual email scan
   */
  async scan(req: Request, res: Response): Promise<void> {
    try {
      const result = await emailScannerService.fullScan();
      res.json(result);
    } catch (error) {
      console.error('Email scan failed:', error);
      res.status(500).json({ error: 'Email scan failed' });
    }
  }

  /**
   * Get recent emails
   */
  async listRecent(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const emails = await emailRepository.findRecent(limit);
      res.json({ emails, count: emails.length });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch emails' });
    }
  }

  /**
   * Get urgent unread emails
   */
  async listUrgent(req: Request, res: Response): Promise<void> {
    try {
      const emails = await emailRepository.findUrgentUnread();
      res.json({ emails, count: emails.length });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch urgent emails' });
    }
  }

  /**
   * Generate a draft reply for a specific email
   */
  async generateDraft(req: Request, res: Response): Promise<void> {
    try {
      const { email_id } = req.params;
      const { persona } = req.query;

      // Try internal ID first, then Gmail ID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(email_id);
      const result = isUuid
        ? await pool.query('SELECT * FROM emails WHERE id = $1 LIMIT 1', [email_id])
        : await pool.query('SELECT * FROM emails WHERE gmail_message_id = $1 LIMIT 1', [email_id]);
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }
      const email = result.rows[0];

      const draft = await ghostwriterService.generateDraft(
        email,
        persona as any
      );

      res.json({ draft, persona });
    } catch (error) {
      console.error('Draft generation failed:', error);
      res.status(500).json({ error: 'Draft generation failed' });
    }
  }

  /**
   * Get pending drafts
   */
  async listDrafts(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const drafts = await emailDraftRepository.findPending(userId);
      res.json({ drafts, count: drafts.length });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch drafts' });
    }
  }

  async dismissDraft(req: Request, res: Response): Promise<void> {
    try {
      const { draft_id } = req.params;
      const draft = await emailDraftRepository.findById(draft_id);
      if (!draft) {
        res.status(404).json({ error: 'Draft not found' });
        return;
      }
      await emailDraftRepository.updateStatus(draft_id, 'rejected');
      res.json({ message: 'Draft dismissed' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to dismiss draft' });
    }
  }

  /**
   * Send an approved draft
   */
  async sendDraft(req: Request, res: Response): Promise<void> {
    try {
      const { draft_id } = req.params;

      const draft = await emailDraftRepository.findById(draft_id);
      if (!draft) {
        res.status(404).json({ error: 'Draft not found' });
        return;
      }

      // Find the original email by internal ID
      const result = await pool.query(
        'SELECT * FROM emails WHERE id = $1', [draft.email_id]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Original email not found' });
        return;
      }
      const email = result.rows[0];

      await gmailService.sendEmail(
        email.account_id,
        email.from_address,
        draft.subject,
        draft.body,
        email.gmail_message_id,
        email.gmail_thread_id || undefined
      );

      await emailDraftRepository.updateStatus(draft_id, 'sent');
      res.json({ message: 'Draft sent successfully' });
    } catch (error) {
      console.error('Send draft failed:', error);
      res.status(500).json({ error: 'Failed to send draft' });
    }
  }
}

export const emailController = new EmailController();
