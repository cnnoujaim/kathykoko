import { Router } from 'express';
import { killswitchController } from '../controllers/killswitch.controller';

const router = Router();

router.get('/status', (req, res) => killswitchController.getStatus(req, res));
router.get('/hours', (req, res) => killswitchController.getHours(req, res));

export default router;
