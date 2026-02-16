import twilio from 'twilio';
import { config } from '../../config';

export class SMSService {
  private client: twilio.Twilio;

  constructor() {
    this.client = twilio(config.twilio.accountSid, config.twilio.authToken);
  }

  /**
   * Send an SMS message
   */
  async sendSMS(to: string, body: string): Promise<void> {
    try {
      await this.client.messages.create({
        from: config.twilio.phoneNumber,
        to,
        body,
      });
      console.log(`SMS sent to ${to}: ${body.substring(0, 50)}...`);
    } catch (error) {
      console.error('Failed to send SMS:', error);
      throw error;
    }
  }

  /**
   * Validate Twilio webhook signature
   */
  validateWebhook(signature: string, url: string, params: any): boolean {
    return twilio.validateRequest(
      config.twilio.authToken,
      signature,
      url,
      params
    );
  }

  /**
   * Generate TwiML response
   */
  generateTwiMLResponse(message?: string): string {
    const twiml = new twilio.twiml.MessagingResponse();
    if (message) {
      twiml.message(message);
    }
    return twiml.toString();
  }
}

export const smsService = new SMSService();
