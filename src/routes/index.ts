import { Router } from 'express';
import smsRoutes from './sms.routes';
import healthRoutes from './health.routes';
import oauthRoutes from './oauth.routes';
import calendarRoutes from './calendar.routes';
import killswitchRoutes from './killswitch.routes';
import emailRoutes from './email.routes';
import briefingRoutes from './briefing.routes';
import dashboardRoutes from './dashboard.routes';

const router = Router();

// Mount routes
router.use('/webhooks/sms', smsRoutes);
router.use('/health', healthRoutes);
router.use('/oauth', oauthRoutes);
router.use('/calendar', calendarRoutes);
router.use('/killswitch', killswitchRoutes);
router.use('/email', emailRoutes);
router.use('/briefing', briefingRoutes);
router.use('/api', dashboardRoutes);

export default router;
