import { Request, Response, NextFunction } from 'express';
import { smsService } from '../services/sms/sms.service';

/**
 * Middleware to validate Twilio webhook signatures
 */
export function validateTwilioRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip validation in development mode (for ngrok testing)
  if (process.env.NODE_ENV === 'development') {
    console.log('⚠️  Skipping Twilio signature validation (development mode)');
    next();
    return;
  }

  const signature = req.headers['x-twilio-signature'] as string;

  if (!signature) {
    console.error('Missing Twilio signature header');
    res.status(403).send('Forbidden: Missing signature');
    return;
  }

  // Construct full URL (Twilio validates against full URL with query params)
  const protocol = req.protocol;
  const host = req.get('host');
  const url = `${protocol}://${host}${req.originalUrl}`;

  const isValid = smsService.validateWebhook(signature, url, req.body);

  if (!isValid) {
    console.error('Invalid Twilio signature');
    res.status(403).send('Forbidden: Invalid signature');
    return;
  }

  next();
}
