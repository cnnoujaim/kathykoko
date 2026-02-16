import { Request, Response } from 'express';
import { pool } from '../config/database';
import { redis } from '../config/redis';

export class HealthController {
  /**
   * Basic health check
   */
  async check(_req: Request, res: Response): Promise<void> {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  /**
   * Check integrations (database, redis, etc.)
   */
  async checkIntegrations(_req: Request, res: Response): Promise<void> {
    const integrations = {
      database: 'unknown',
      redis: 'unknown',
    };

    // Check PostgreSQL
    try {
      await pool.query('SELECT 1');
      integrations.database = 'ok';
    } catch (error) {
      integrations.database = 'error';
      console.error('Database health check failed:', error);
    }

    // Check Redis
    try {
      await redis.ping();
      integrations.redis = 'ok';
    } catch (error) {
      integrations.redis = 'error';
      console.error('Redis health check failed:', error);
    }

    const allOk = Object.values(integrations).every((status) => status === 'ok');

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      integrations,
      timestamp: new Date().toISOString(),
    });
  }
}

export const healthController = new HealthController();
