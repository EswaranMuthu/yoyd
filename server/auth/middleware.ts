import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "./jwt";
import { authStorage } from "./storage";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];
  const payload = verifyAccessToken(token);

  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  authStorage.getUserById(payload.userId).then((user) => {
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.authUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
    next();
  }).catch(() => {
    res.status(500).json({ message: "Authentication error" });
  });
}
