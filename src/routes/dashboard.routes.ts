import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';

const router = Router();

router.post('/chat', (req, res) => dashboardController.chat(req, res));
router.get('/dashboard', (req, res) => dashboardController.getDashboard(req, res));
router.get('/tasks', (req, res) => dashboardController.getTasks(req, res));
router.patch('/tasks/:id/status', (req, res) => dashboardController.updateTaskStatus(req, res));
router.delete('/tasks/:id', (req, res) => dashboardController.deleteTask(req, res));
router.get('/calendar', (req, res) => dashboardController.getCalendar(req, res));
router.get('/messages', (req, res) => dashboardController.getMessages(req, res));
router.get('/email-todos', (req, res) => dashboardController.getEmailTodos(req, res));
router.get('/killswitch', (req, res) => dashboardController.getKillswitch(req, res));

export default router;
