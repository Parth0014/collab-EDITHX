import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import UserModel from "../models/User";

export interface AuthPayload {
  userId: string;
  email: string;
  username: string;
  collabId: string;
  sessionId: string;
  tokenVersion: number;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

const JWT_SECRET = process.env.JWT_SECRET;

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "7d" });
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as AuthPayload;

    const user = await UserModel.findById(decoded.userId).select(
      "email username collabId activeSessionId tokenVersion",
    );
    if (!user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    if (
      user.activeSessionId !== decoded.sessionId ||
      Number(user.tokenVersion || 0) !== Number(decoded.tokenVersion || 0)
    ) {
      return res
        .status(401)
        .json({ error: "Session expired. Please login again." });
    }

    req.user = {
      userId: decoded.userId,
      email: user.email,
      username: user.username,
      collabId: user.collabId,
      sessionId: decoded.sessionId,
      tokenVersion: Number(user.tokenVersion || 0),
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
