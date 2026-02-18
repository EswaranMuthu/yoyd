import { Express } from "express";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { authStorage } from "./storage";
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
  hashPassword,
  comparePassword,
} from "./jwt";
import { isAuthenticated } from "./middleware";
import { getSecret } from "../vault";
import { logger } from "../logger";

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(30, "Username must be at most 30 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export function registerAuthRoutes(app: Express) {
  app.get("/api/login", (_req, res) => {
    res.redirect("/");
  });

  app.get("/api/callback", (_req, res) => {
    res.redirect("/");
  });

  app.get("/api/logout", (_req, res) => {
    res.redirect("/");
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const input = registerSchema.parse(req.body);
      logger.auth.info("Registration attempt", { username: input.username, email: input.email });

      const existingEmail = await authStorage.getUserByEmail(input.email);
      if (existingEmail) {
        logger.auth.warn("Registration failed - email exists", { email: input.email });
        return res.status(400).json({ message: "Email already registered" });
      }

      const existingUsername = await authStorage.getUserByUsername(input.username);
      if (existingUsername) {
        logger.auth.warn("Registration failed - username taken", { username: input.username });
        return res.status(400).json({ message: "Username already taken" });
      }

      const passwordHash = await hashPassword(input.password);
      const user = await authStorage.createUser(
        input.username,
        input.email,
        passwordHash,
        input.firstName,
        input.lastName
      );

      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken();
      const refreshExpiry = getRefreshTokenExpiry();

      await authStorage.saveRefreshToken(user.id, refreshToken, refreshExpiry);

      logger.auth.info("Registration successful", { userId: user.id, username: user.username });
      res.status(201).json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        accessToken,
        refreshToken,
        expiresIn: 900,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.auth.warn("Registration validation failed", { errors: error.errors });
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      logger.auth.error("Registration failed", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      logger.auth.info("Login attempt", { email: input.email });

      const user = await authStorage.getUserByEmail(input.email);
      if (!user) {
        logger.auth.warn("Login failed - user not found", { email: input.email });
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (user.authProvider === "google" || !user.password) {
        logger.auth.warn("Login blocked - Google-only account", { email: input.email, userId: user.id });
        return res.status(400).json({ message: "This account uses Google sign-in. Please use the Google button to log in." });
      }

      const validPassword = await comparePassword(input.password, user.password);
      if (!validPassword) {
        logger.auth.warn("Login failed - invalid password", { email: input.email, userId: user.id });
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken();
      const refreshExpiry = getRefreshTokenExpiry();

      await authStorage.saveRefreshToken(user.id, refreshToken, refreshExpiry);

      logger.auth.info("Login successful", { userId: user.id, username: user.username });
      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        accessToken,
        refreshToken,
        expiresIn: 900,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      logger.auth.error("Login failed", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const input = refreshSchema.parse(req.body);
      logger.auth.debug("Token refresh attempt");

      const tokenData = await authStorage.getRefreshToken(input.refreshToken);
      if (!tokenData) {
        logger.auth.warn("Token refresh failed - invalid token");
        return res.status(401).json({ message: "Invalid refresh token" });
      }

      if (new Date() > tokenData.expiresAt) {
        await authStorage.deleteRefreshToken(input.refreshToken);
        logger.auth.warn("Token refresh failed - expired", { userId: tokenData.userId });
        return res.status(401).json({ message: "Refresh token expired" });
      }

      const user = await authStorage.getUserById(tokenData.userId);
      if (!user) {
        logger.auth.warn("Token refresh failed - user not found", { userId: tokenData.userId });
        return res.status(401).json({ message: "User not found" });
      }

      await authStorage.deleteRefreshToken(input.refreshToken);

      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const newRefreshToken = generateRefreshToken();
      const refreshExpiry = getRefreshTokenExpiry();

      await authStorage.saveRefreshToken(user.id, newRefreshToken, refreshExpiry);

      logger.auth.debug("Token refreshed", { userId: user.id, username: user.username });
      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: 900,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      logger.auth.error("Token refresh failed", error);
      res.status(500).json({ message: "Token refresh failed" });
    }
  });

  app.post("/api/auth/logout", isAuthenticated, async (req, res) => {
    try {
      if (req.authUser) {
        logger.auth.info("Logout", { userId: req.authUser.id, username: req.authUser.username });
        await authStorage.deleteUserRefreshTokens(req.authUser.id);
      }
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      logger.auth.error("Logout failed", error, { userId: req.authUser?.id });
      res.status(500).json({ message: "Logout failed" });
    }
  });

  app.get("/api/auth/user", isAuthenticated, (req, res) => {
    if (!req.authUser) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.authUser);
  });

  app.post("/api/auth/google", async (req, res) => {
    try {
      logger.auth.info("Google OAuth attempt");
      const googleClientId = await getSecret("GOOGLE_CLIENT_ID");
      if (!googleClientId) {
        logger.auth.error("Google OAuth not configured - missing GOOGLE_CLIENT_ID");
        return res.status(500).json({ message: "Google login is not configured" });
      }

      const { credential } = req.body;
      if (!credential) {
        logger.auth.warn("Google OAuth - missing credential in request");
        return res.status(400).json({ message: "Google credential is required" });
      }

      const googleClient = new OAuth2Client(googleClientId);
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.sub) {
        logger.auth.warn("Google OAuth - invalid token payload");
        return res.status(400).json({ message: "Invalid Google token" });
      }

      const googleSub = payload.sub;
      const email = payload.email;
      const firstName = payload.given_name || null;
      const lastName = payload.family_name || null;
      const picture = payload.picture || null;

      logger.auth.debug("Google token verified", { email, googleSub });

      let user = await authStorage.getUserByGoogleSub(googleSub);

      if (!user) {
        const existingEmailUser = await authStorage.getUserByEmail(email);
        if (existingEmailUser) {
          if (existingEmailUser.authProvider === "local" && existingEmailUser.password) {
            logger.auth.warn("Google OAuth blocked - email has local account", { email });
            return res.status(400).json({
              message: "An account with this email already exists. Please sign in with your password.",
            });
          }
          logger.auth.info("Linking Google account to existing user", { userId: existingEmailUser.id, email });
          await authStorage.linkGoogleAccount(existingEmailUser.id, googleSub, picture || undefined);
          user = { ...existingEmailUser, googleSub, authProvider: "google" };
        } else {
          let username = email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 25);
          const existingUsername = await authStorage.getUserByUsername(username);
          if (existingUsername) {
            username = `${username}_${Date.now().toString(36).slice(-4)}`;
          }

          user = await authStorage.createGoogleUser(
            username,
            email,
            googleSub,
            firstName || undefined,
            lastName || undefined,
            picture || undefined
          );
          logger.auth.info("New Google user created", { userId: user.id, username: user.username, email });
        }
      } else {
        logger.auth.debug("Existing Google user found", { userId: user.id, username: user.username });
      }

      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken();
      const refreshExpiry = getRefreshTokenExpiry();

      await authStorage.saveRefreshToken(user.id, refreshToken, refreshExpiry);

      logger.auth.info("Google OAuth successful", { userId: user.id, username: user.username });
      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        accessToken,
        refreshToken,
        expiresIn: 900,
      });
    } catch (error) {
      logger.auth.error("Google OAuth failed", error);
      res.status(500).json({ message: "Google authentication failed" });
    }
  });

  app.get("/api/auth/google-client-id", async (_req, res) => {
    const googleClientId = await getSecret("GOOGLE_CLIENT_ID");
    if (!googleClientId) {
      return res.status(404).json({ message: "Google login not configured" });
    }
    res.json({ clientId: googleClientId });
  });
}
