import { Request, Response } from 'express';
import { morningBriefingService } from '../services/briefing/morning-briefing.service';
import { eveningCheckinService } from '../services/briefing/evening-checkin.service';

class BriefingController {
  /**
   * Manually trigger morning briefing
   */
  async triggerMorning(req: Request, res: Response): Promise<void> {
    try {
      await morningBriefingService.sendBriefing();
      res.json({ message: 'Morning briefing sent' });
    } catch (error) {
      console.error('Morning briefing failed:', error);
      res.status(500).json({ error: 'Morning briefing failed' });
    }
  }

  /**
   * Manually trigger evening check-in
   */
  async triggerEvening(req: Request, res: Response): Promise<void> {
    try {
      await eveningCheckinService.sendCheckin();
      res.json({ message: 'Evening check-in sent' });
    } catch (error) {
      console.error('Evening check-in failed:', error);
      res.status(500).json({ error: 'Evening check-in failed' });
    }
  }

  /**
   * Preview morning briefing without sending
   */
  async preview(req: Request, res: Response): Promise<void> {
    try {
      const briefing = await morningBriefingService.generateBriefing();
      res.json({ briefing, charCount: briefing.length });
    } catch (error) {
      console.error('Briefing preview failed:', error);
      res.status(500).json({ error: 'Briefing preview failed' });
    }
  }
}

export const briefingController = new BriefingController();
