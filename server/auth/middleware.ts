import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "./jwt";
import { authStorage } from "./storage";
import { logger } from "../logger";

export interface AuthUser {
  id: string;
  username: string;
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
    logger.auth.debug("Auth rejected - no Bearer token", { path: req.path });
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];
  const payload = verifyAccessToken(token);

  if (!payload) {
    logger.auth.debug("Auth rejected - invalid/expired token", { path: req.path });
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  authStorage.getUserById(payload.userId).then((user) => {
    if (!user) {
      logger.auth.warn("Auth rejected - user not found", { userId: payload.userId, path: req.path });
      return res.status(401).json({ message: "User not found" });
    }

    req.authUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
    next();
  }).catch((error) => {
    logger.auth.error("Auth middleware error", error, { path: req.path });
    res.status(500).json({ message: "Authentication error" });
  });
}
