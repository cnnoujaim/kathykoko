import { Router } from 'express';
import { calendarController } from '../controllers/calendar.controller';

const router = Router();

router.post('/sync/:account_id', (req, res) => calendarController.sync(req, res));
router.get('/conflicts/:account_id', (req, res) => calendarController.checkConflicts(req, res));
router.post('/auto-block/:account_id', (req, res) => calendarController.autoBlockStudio(req, res));

export default router;
