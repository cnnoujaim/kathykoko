import { Router } from 'express';
import { healthController } from '../controllers/health.controller';

const router = Router();

router.get('/', (req, res) => healthController.check(req, res));
router.get('/integrations', (req, res) => healthController.checkIntegrations(req, res));

export default router;
