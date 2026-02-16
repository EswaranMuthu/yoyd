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

      const existingEmail = await authStorage.getUserByEmail(input.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const existingUsername = await authStorage.getUserByUsername(input.username);
      if (existingUsername) {
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
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);

      const user = await authStorage.getUserByEmail(input.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (user.authProvider === "google" || !user.password) {
        return res.status(400).json({ message: "This account uses Google sign-in. Please use the Google button to log in." });
      }

      const validPassword = await comparePassword(input.password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken();
      const refreshExpiry = getRefreshTokenExpiry();

      await authStorage.saveRefreshToken(user.id, refreshToken, refreshExpiry);

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
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const input = refreshSchema.parse(req.body);

      const tokenData = await authStorage.getRefreshToken(input.refreshToken);
      if (!tokenData) {
        return res.status(401).json({ message: "Invalid refresh token" });
      }

      if (new Date() > tokenData.expiresAt) {
        await authStorage.deleteRefreshToken(input.refreshToken);
        return res.status(401).json({ message: "Refresh token expired" });
      }

      const user = await authStorage.getUserById(tokenData.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      await authStorage.deleteRefreshToken(input.refreshToken);

      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const newRefreshToken = generateRefreshToken();
      const refreshExpiry = getRefreshTokenExpiry();

      await authStorage.saveRefreshToken(user.id, newRefreshToken, refreshExpiry);

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
      console.error("Refresh error:", error);
      res.status(500).json({ message: "Token refresh failed" });
    }
  });

  app.post("/api/auth/logout", isAuthenticated, async (req, res) => {
    try {
      if (req.authUser) {
        await authStorage.deleteUserRefreshTokens(req.authUser.id);
      }
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error);
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
      const googleClientId = await getSecret("GOOGLE_CLIENT_ID");
      if (!googleClientId) {
        return res.status(500).json({ message: "Google login is not configured" });
      }

      const { credential } = req.body;
      if (!credential) {
        return res.status(400).json({ message: "Google credential is required" });
      }

      const googleClient = new OAuth2Client(googleClientId);
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.sub) {
        return res.status(400).json({ message: "Invalid Google token" });
      }

      const googleSub = payload.sub;
      const email = payload.email;
      const firstName = payload.given_name || null;
      const lastName = payload.family_name || null;
      const picture = payload.picture || null;

      let user = await authStorage.getUserByGoogleSub(googleSub);

      if (!user) {
        const existingEmailUser = await authStorage.getUserByEmail(email);
        if (existingEmailUser) {
          if (existingEmailUser.authProvider === "local" && existingEmailUser.password) {
            return res.status(400).json({
              message: "An account with this email already exists. Please sign in with your password.",
            });
          }
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
        }
      }

      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken();
      const refreshExpiry = getRefreshTokenExpiry();

      await authStorage.saveRefreshToken(user.id, refreshToken, refreshExpiry);

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
      console.error("Google auth error:", error);
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
