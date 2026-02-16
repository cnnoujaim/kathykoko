import { Router } from 'express';
import smsRoutes from './sms.routes';
import healthRoutes from './health.routes';

const router = Router();

// Mount routes
router.use('/webhooks/sms', smsRoutes);
router.use('/health', healthRoutes);

export default router;
