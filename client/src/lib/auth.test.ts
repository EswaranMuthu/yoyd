import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  isTokenExpiringSoon,
} from "./auth";

describe("Auth token management", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe("getAccessToken", () => {
    it("should return null when no token is stored", () => {
      expect(getAccessToken()).toBeNull();
    });

    it("should return the stored access token", () => {
      localStorageMock.setItem("accessToken", "my-access-token");
      expect(getAccessToken()).toBe("my-access-token");
    });
  });

  describe("getRefreshToken", () => {
    it("should return null when no token is stored", () => {
      expect(getRefreshToken()).toBeNull();
    });

    it("should return the stored refresh token", () => {
      localStorageMock.setItem("refreshToken", "my-refresh-token");
      expect(getRefreshToken()).toBe("my-refresh-token");
    });
  });

  describe("setTokens", () => {
    it("should store access token, refresh token, and expiry", () => {
      setTokens("access-abc", "refresh-xyz", 900);

      expect(localStorageMock.setItem).toHaveBeenCalledWith("accessToken", "access-abc");
      expect(localStorageMock.setItem).toHaveBeenCalledWith("refreshToken", "refresh-xyz");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "tokenExpiry",
        expect.any(String)
      );
    });

    it("should set expiry based on expiresIn seconds from now", () => {
      const before = Date.now();
      setTokens("a", "b", 900);
      const after = Date.now();

      const expiryCall = localStorageMock.setItem.mock.calls.find(
        (c: string[]) => c[0] === "tokenExpiry"
      );
      const expiryValue = parseInt(expiryCall![1], 10);
      expect(expiryValue).toBeGreaterThanOrEqual(before + 900 * 1000);
      expect(expiryValue).toBeLessThanOrEqual(after + 900 * 1000);
    });
  });

  describe("clearTokens", () => {
    it("should remove all token-related items from localStorage", () => {
      localStorageMock.setItem("accessToken", "a");
      localStorageMock.setItem("refreshToken", "b");
      localStorageMock.setItem("tokenExpiry", "123");

      clearTokens();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith("accessToken");
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("refreshToken");
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("tokenExpiry");
    });
  });

  describe("isTokenExpiringSoon", () => {
    it("should return true when no expiry is stored", () => {
      expect(isTokenExpiringSoon()).toBe(true);
    });

    it("should return true when token is already expired", () => {
      const pastTime = (Date.now() - 10000).toString();
      localStorageMock.setItem("tokenExpiry", pastTime);
      expect(isTokenExpiringSoon()).toBe(true);
    });

    it("should return true when token expires within 60 seconds", () => {
      const soonExpiry = (Date.now() + 30 * 1000).toString();
      localStorageMock.setItem("tokenExpiry", soonExpiry);
      expect(isTokenExpiringSoon()).toBe(true);
    });

    it("should return false when token has plenty of time left", () => {
      const futureExpiry = (Date.now() + 10 * 60 * 1000).toString();
      localStorageMock.setItem("tokenExpiry", futureExpiry);
      expect(isTokenExpiringSoon()).toBe(false);
    });

    it("should return false when token expires exactly at the 60-second boundary (strict >)", () => {
      const boundaryExpiry = (Date.now() + 60 * 1000).toString();
      localStorageMock.setItem("tokenExpiry", boundaryExpiry);
      expect(isTokenExpiringSoon()).toBe(false);
    });

    it("should return true when token is just past the 60-second buffer", () => {
      const justPast = (Date.now() + 59 * 1000).toString();
      localStorageMock.setItem("tokenExpiry", justPast);
      expect(isTokenExpiringSoon()).toBe(true);
    });
  });
});
