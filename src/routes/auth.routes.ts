import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/google', (req, res) => authController.login(req, res));
router.get('/callback', (req, res) => authController.callback(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));

// Protected routes
router.get('/me', authMiddleware, (req, res) => authController.me(req, res));
router.get('/google/connect', authMiddleware, (req, res) => authController.connectAccount(req, res));

export default router;
