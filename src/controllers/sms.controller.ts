import { Request, Response } from 'express';
import { messageRepository } from '../repositories/message.repository';
import { smsService } from '../services/sms/sms.service';
import { smsQueue } from '../jobs/queue';

export class SMSController {
  /**
   * Handle incoming SMS webhook from Twilio
   * CRITICAL: Must respond within 500ms or Twilio will retry
   */
  async handleIncoming(req: Request, res: Response): Promise<void> {
    try {
      const { MessageSid, From, To, Body } = req.body;

      console.log(`📱 Incoming SMS from ${From}: ${Body}`);

      // 1. Idempotency check: Has this message already been processed?
      const isProcessed = await messageRepository.isProcessed(MessageSid);
      if (isProcessed) {
        console.log(`⚠️  Duplicate message detected: ${MessageSid}`);
        const twiml = smsService.generateTwiMLResponse();
        res.type('text/xml').send(twiml);
        return;
      }

      // 2. Store message in database with status 'received'
      await messageRepository.create({
        message_sid: MessageSid,
        direction: 'inbound',
        from_number: From,
        to_number: To,
        body: Body,
        status: 'received',
      });

      // 3. Enqueue async processing job
      await smsQueue.add('process-sms', {
        messageSid: MessageSid,
        from: From,
        body: Body,
      });

      // 4. Return TwiML response immediately (< 100ms target)
      const twiml = smsService.generateTwiMLResponse('Processing your request...');
      res.type('text/xml').send(twiml);
    } catch (error) {
      console.error('Error handling incoming SMS:', error);

      // Even on error, return valid TwiML to prevent Twilio retries
      const twiml = smsService.generateTwiMLResponse('Error processing request.');
      res.type('text/xml').send(twiml);
    }
  }

  /**
   * Handle Twilio status callbacks (optional)
   */
  async handleStatus(req: Request, res: Response): Promise<void> {
    const { MessageSid, MessageStatus } = req.body;
    console.log(`📊 Message status update: ${MessageSid} → ${MessageStatus}`);

    res.sendStatus(200);
  }
}

export const smsController = new SMSController();
