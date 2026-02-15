import { describe, it, expect, beforeAll } from "vitest";

process.env.SESSION_SECRET = "test-secret-key-for-unit-tests";

import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
  verifyAccessToken,
  hashPassword,
  comparePassword,
  type TokenPayload,
} from "./jwt";

describe("JWT utilities", () => {
  const testPayload: TokenPayload = {
    userId: "user-123",
    email: "test@example.com",
  };

  describe("generateAccessToken", () => {
    it("should generate a valid JWT string", () => {
      const token = generateAccessToken(testPayload);
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("should generate different tokens for different payloads", () => {
      const token1 = generateAccessToken(testPayload);
      const token2 = generateAccessToken({ userId: "user-456", email: "other@example.com" });
      expect(token1).not.toBe(token2);
    });
  });

  describe("verifyAccessToken", () => {
    it("should verify a valid token and return the payload", () => {
      const token = generateAccessToken(testPayload);
      const decoded = verifyAccessToken(token);
      expect(decoded).toBeTruthy();
      expect(decoded!.userId).toBe(testPayload.userId);
      expect(decoded!.email).toBe(testPayload.email);
    });

    it("should return null for an invalid token", () => {
      const result = verifyAccessToken("invalid.token.here");
      expect(result).toBeNull();
    });

    it("should return null for an empty string", () => {
      const result = verifyAccessToken("");
      expect(result).toBeNull();
    });

    it("should return null for a tampered token", () => {
      const token = generateAccessToken(testPayload);
      const tampered = token.slice(0, -5) + "XXXXX";
      const result = verifyAccessToken(tampered);
      expect(result).toBeNull();
    });
  });

  describe("generateRefreshToken", () => {
    it("should generate a hex string of 80 characters", () => {
      const token = generateRefreshToken();
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token).toHaveLength(80);
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });

    it("should generate unique tokens", () => {
      const tokens = new Set(Array.from({ length: 10 }, () => generateRefreshToken()));
      expect(tokens.size).toBe(10);
    });
  });

  describe("getRefreshTokenExpiry", () => {
    it("should return a date 7 days in the future", () => {
      const before = new Date();
      const expiry = getRefreshTokenExpiry();
      const after = new Date();

      const expectedMin = new Date(before);
      expectedMin.setDate(expectedMin.getDate() + 7);

      const expectedMax = new Date(after);
      expectedMax.setDate(expectedMax.getDate() + 7);

      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - 1000);
      expect(expiry.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + 1000);
    });

    it("should return a Date instance", () => {
      const expiry = getRefreshTokenExpiry();
      expect(expiry).toBeInstanceOf(Date);
    });
  });

  describe("hashPassword", () => {
    it("should return a bcrypt hash string", async () => {
      const hash = await hashPassword("mypassword");
      expect(hash).toBeTruthy();
      expect(hash).not.toBe("mypassword");
      expect(hash.startsWith("$2")).toBe(true);
    });

    it("should produce different hashes for the same password (salt)", async () => {
      const hash1 = await hashPassword("same-password");
      const hash2 = await hashPassword("same-password");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("comparePassword", () => {
    it("should return true for a matching password", async () => {
      const hash = await hashPassword("correct-password");
      const result = await comparePassword("correct-password", hash);
      expect(result).toBe(true);
    });

    it("should return false for a wrong password", async () => {
      const hash = await hashPassword("correct-password");
      const result = await comparePassword("wrong-password", hash);
      expect(result).toBe(false);
    });

    it("should return false for an empty password", async () => {
      const hash = await hashPassword("correct-password");
      const result = await comparePassword("", hash);
      expect(result).toBe(false);
    });
  });
});
