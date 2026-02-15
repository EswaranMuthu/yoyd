import { describe, it, expect } from "vitest";
import { isUnauthorizedError } from "./auth-utils";

describe("isUnauthorizedError", () => {
  it("should return true for 401: Unauthorized messages", () => {
    expect(isUnauthorizedError(new Error("401: Unauthorized"))).toBe(true);
    expect(isUnauthorizedError(new Error("401: Unauthorized - session expired"))).toBe(true);
  });

  it("should return false for non-401 errors", () => {
    expect(isUnauthorizedError(new Error("403: Forbidden"))).toBe(false);
    expect(isUnauthorizedError(new Error("500: Internal Server Error"))).toBe(false);
    expect(isUnauthorizedError(new Error("Something went wrong"))).toBe(false);
  });

  it("should return false for empty error messages", () => {
    expect(isUnauthorizedError(new Error(""))).toBe(false);
  });

  it("should return false for 401 without Unauthorized", () => {
    expect(isUnauthorizedError(new Error("401: Access Denied"))).toBe(false);
  });
});
