import { Router } from 'express';
import { oauthController } from '../controllers/oauth.controller';

const router = Router();

// Simple onboarding flow (recommended)
router.get('/connect', (req, res) => oauthController.connect(req, res));

// Advanced/manual OAuth flow
router.get('/authorize', (req, res) => oauthController.authorize(req, res));

// OAuth callback (handles both flows)
router.get('/callback', (req, res) => oauthController.callback(req, res));

// Disconnect
router.delete('/disconnect/:account_id', (req, res) => oauthController.disconnect(req, res));

export default router;
