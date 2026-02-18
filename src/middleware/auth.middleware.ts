import { Request, Response, NextFunction } from 'express';
import { authService, JwtPayload } from '../services/auth/auth.service';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * JWT auth middleware.
 * Reads kk_token from cookies, verifies JWT, sets req.user.
 * Returns 401 if missing or invalid.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.kk_token;

  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const payload = authService.verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
