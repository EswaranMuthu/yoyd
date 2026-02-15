import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.SESSION_SECRET = "test-secret-key-for-unit-tests";

import { generateAccessToken } from "./jwt";

vi.mock("./storage", () => ({
  authStorage: {
    getUserById: vi.fn(),
  },
}));

import { isAuthenticated } from "./middleware";
import { authStorage } from "./storage";

function createMockReqResNext() {
  const req: any = {
    headers: {},
  };
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  const next = vi.fn();
  return { req, res, next };
}

describe("isAuthenticated middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 if no Authorization header is provided", () => {
    const { req, res, next } = createMockReqResNext();
    isAuthenticated(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 if Authorization header does not start with Bearer", () => {
    const { req, res, next } = createMockReqResNext();
    req.headers.authorization = "Basic abc123";
    isAuthenticated(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Authentication required");
  });

  it("should return 401 if the token is invalid", () => {
    const { req, res, next } = createMockReqResNext();
    req.headers.authorization = "Bearer invalid-token";
    isAuthenticated(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Invalid or expired token");
  });

  it("should return 401 if the user is not found", async () => {
    const { req, res, next } = createMockReqResNext();
    const token = generateAccessToken({ userId: "missing-user", email: "test@example.com" });
    req.headers.authorization = `Bearer ${token}`;

    (authStorage.getUserById as any).mockResolvedValue(null);

    isAuthenticated(req, res, next);

    await vi.waitFor(() => {
      expect(res.statusCode).toBe(401);
      expect(res.body.message).toBe("User not found");
    });
  });

  it("should set req.authUser and call next for a valid token and user", async () => {
    const { req, res, next } = createMockReqResNext();
    const token = generateAccessToken({ userId: "user-123", email: "test@example.com" });
    req.headers.authorization = `Bearer ${token}`;

    const mockUser = {
      id: "user-123",
      username: "testuser",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
    };
    (authStorage.getUserById as any).mockResolvedValue(mockUser);

    isAuthenticated(req, res, next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalled();
      expect(req.authUser).toEqual({
        id: "user-123",
        username: "testuser",
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
      });
    });
  });

  it("should return 500 if getUserById throws", async () => {
    const { req, res, next } = createMockReqResNext();
    const token = generateAccessToken({ userId: "user-123", email: "test@example.com" });
    req.headers.authorization = `Bearer ${token}`;

    (authStorage.getUserById as any).mockRejectedValue(new Error("DB error"));

    isAuthenticated(req, res, next);

    await vi.waitFor(() => {
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe("Authentication error");
    });
  });
});
