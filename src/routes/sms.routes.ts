import { Router } from 'express';
import { smsController } from '../controllers/sms.controller';
import { validateTwilioRequest } from '../middleware/twilio-validator';

const router = Router();

// Twilio webhook endpoints
router.post('/incoming', validateTwilioRequest, (req, res) =>
  smsController.handleIncoming(req, res)
);

router.post('/status', validateTwilioRequest, (req, res) =>
  smsController.handleStatus(req, res)
);

export default router;
