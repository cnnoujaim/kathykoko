import { Router } from 'express';
import { emailController } from '../controllers/email.controller';

const router = Router();

router.post('/scan', (req, res) => emailController.scan(req, res));
router.get('/recent', (req, res) => emailController.listRecent(req, res));
router.get('/urgent', (req, res) => emailController.listUrgent(req, res));
router.get('/drafts', (req, res) => emailController.listDrafts(req, res));
router.post('/draft/:email_id', (req, res) => emailController.generateDraft(req, res));
router.post('/send/:draft_id', (req, res) => emailController.sendDraft(req, res));

export default router;
