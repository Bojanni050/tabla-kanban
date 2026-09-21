import { Request, Response, NextFunction } from 'express';

// Extend express-session to include userId
declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.userId = req.session.userId;
  next();
}
