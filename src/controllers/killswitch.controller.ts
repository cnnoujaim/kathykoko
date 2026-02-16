import { Request, Response } from 'express';
import { killswitchService } from '../services/killswitch/killswitch.service';

class KillswitchController {
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = await killswitchService.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Failed to get killswitch status:', error);
      res.status(500).json({ error: 'Failed to get killswitch status' });
    }
  }

  async getHours(req: Request, res: Response): Promise<void> {
    try {
      const { totalHours, events } = await killswitchService.calculateWeeklyHours();
      res.json({ totalHours, maxHours: 40, remaining: Math.max(0, 40 - totalHours), events });
    } catch (error) {
      console.error('Failed to get hours:', error);
      res.status(500).json({ error: 'Failed to get hours' });
    }
  }
}

export const killswitchController = new KillswitchController();
