import { Router } from 'express';
import { briefingController } from '../controllers/briefing.controller';

const router = Router();

router.post('/morning', briefingController.triggerMorning.bind(briefingController));
router.post('/evening', briefingController.triggerEvening.bind(briefingController));
router.get('/preview', briefingController.preview.bind(briefingController));

export default router;
