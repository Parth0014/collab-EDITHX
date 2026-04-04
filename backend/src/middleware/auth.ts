import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  email: string;
  username: string;
  collabId: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

const JWT_SECRET = process.env.JWT_SECRET;

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: '7d' });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
