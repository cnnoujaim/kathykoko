import { Router } from 'express';
import smsRoutes from './sms.routes';
import healthRoutes from './health.routes';
import oauthRoutes from './oauth.routes';
import calendarRoutes from './calendar.routes';

const router = Router();

// Mount routes
router.use('/webhooks/sms', smsRoutes);
router.use('/health', healthRoutes);
router.use('/oauth', oauthRoutes);
router.use('/calendar', calendarRoutes);

export default router;
