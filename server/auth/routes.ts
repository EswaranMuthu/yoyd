import { Express } from "express";
import { z } from "zod";
import { authStorage } from "./storage";
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
  hashPassword,
  comparePassword,
} from "./jwt";
import { isAuthenticated } from "./middleware";

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
        expiresIn: 300,
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
        expiresIn: 300,
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
        expiresIn: 300,
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
}
