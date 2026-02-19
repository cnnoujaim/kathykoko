import { Request, Response } from 'express';
import { messageRepository } from '../repositories/message.repository';
import { smsService } from '../services/sms/sms.service';
import { smsQueue } from '../jobs/queue';
import { userRepository } from '../repositories/user.repository';

export class SMSController {
  /**
   * Handle incoming SMS webhook from Twilio
   * CRITICAL: Must respond within 500ms or Twilio will retry
   */
  async handleIncoming(req: Request, res: Response): Promise<void> {
    try {
      const { MessageSid, From, To, Body } = req.body;

      console.log(`📱 Incoming SMS from ${From}: ${Body}`);

      // 1. Idempotency check
      const isProcessed = await messageRepository.isProcessed(MessageSid);
      if (isProcessed) {
        console.log(`⚠️  Duplicate message detected: ${MessageSid}`);
        const twiml = smsService.generateTwiMLResponse();
        res.type('text/xml').send(twiml);
        return;
      }

      // 2. Look up user + account by phone number
      const match = await userRepository.findByPhoneWithAccount(From);
      const userId = match?.user.id;
      const accountId = match?.accountId || undefined;
      const accountType = match?.accountType || undefined;

      // 3. Store message
      await messageRepository.create({
        message_sid: MessageSid,
        direction: 'inbound',
        from_number: From,
        to_number: To,
        body: Body,
        status: 'received',
        user_id: userId,
      });

      if (!userId) {
        // Unknown phone number — respond with setup instructions
        const twiml = smsService.generateTwiMLResponse(
          'Hi! I don\'t recognize this number. Please sign in at the web dashboard first and add your phone number in Settings.'
        );
        res.type('text/xml').send(twiml);
        return;
      }

      if (accountType) {
        console.log(`📱 Matched to account: ${accountType} (${accountId})`);
      }

      // 4. Enqueue async processing job
      await smsQueue.add('process-sms', {
        messageSid: MessageSid,
        from: From,
        body: Body,
        userId: userId,
        accountId: accountId,
        accountType: accountType,
      });

      // 5. Return TwiML response immediately
      const twiml = smsService.generateTwiMLResponse('Processing your request...');
      res.type('text/xml').send(twiml);
    } catch (error) {
      console.error('Error handling incoming SMS:', error);
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
