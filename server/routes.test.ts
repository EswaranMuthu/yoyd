import { describe, it, expect } from "vitest";
import {
  getUserPrefix,
  addUserPrefix,
  stripUserPrefix,
  stripPrefixFromObject,
  sanitizeFileName,
  isValidFileName,
  hasPathTraversal,
  computeParentKey,
  calculateTotalParts,
  calculatePartRange,
  batchPartNumbers,
  calculateOverallProgress,
  cleanETag,
} from "./helpers";

describe("Route helper functions", () => {
  const username = "testuser";

  describe("getUserPrefix", () => {
    it("should return users/{username}/", () => {
      expect(getUserPrefix("alice")).toBe("users/alice/");
      expect(getUserPrefix("bob")).toBe("users/bob/");
    });

    it("should handle usernames with spaces", () => {
      expect(getUserPrefix("John Doe")).toBe("users/John Doe/");
    });
  });

  describe("addUserPrefix", () => {
    it("should add prefix to a plain key", () => {
      expect(addUserPrefix("photos/", username)).toBe("users/testuser/photos/");
    });

    it("should add prefix to a file key", () => {
      expect(addUserPrefix("photos/sunset.jpg", username)).toBe("users/testuser/photos/sunset.jpg");
    });

    it("should not double-prefix an already prefixed key", () => {
      expect(addUserPrefix("users/testuser/photos/", username)).toBe("users/testuser/photos/");
    });

    it("should handle empty key", () => {
      expect(addUserPrefix("", username)).toBe("users/testuser/");
    });
  });

  describe("stripUserPrefix", () => {
    it("should strip the user prefix from a key", () => {
      expect(stripUserPrefix("users/testuser/photos/", username)).toBe("photos/");
    });

    it("should strip the user prefix from a file key", () => {
      expect(stripUserPrefix("users/testuser/photos/sunset.jpg", username)).toBe("photos/sunset.jpg");
    });

    it("should return the key unchanged if no prefix match", () => {
      expect(stripUserPrefix("users/otheruser/photos/", username)).toBe("users/otheruser/photos/");
    });

    it("should return empty string when stripping the prefix itself", () => {
      expect(stripUserPrefix("users/testuser/", username)).toBe("");
    });

    it("should return key as-is if it has no prefix", () => {
      expect(stripUserPrefix("noprefixkey", username)).toBe("noprefixkey");
    });
  });

  describe("stripPrefixFromObject", () => {
    it("should strip prefix from key and parentKey", () => {
      const obj = {
        id: 1,
        key: "users/testuser/photos/sunset.jpg",
        parentKey: "users/testuser/photos/",
        name: "sunset.jpg",
        isFolder: false,
        size: null,
        mimeType: null,
        etag: null,
        lastModified: null,
        createdAt: null,
        updatedAt: null,
      };
      const result = stripPrefixFromObject(obj, username);
      expect(result.key).toBe("photos/sunset.jpg");
      expect(result.parentKey).toBe("photos/");
    });

    it("should set parentKey to null when it equals the user prefix", () => {
      const obj = {
        id: 2,
        key: "users/testuser/photos/",
        parentKey: "users/testuser/",
        name: "photos",
        isFolder: true,
        size: null,
        mimeType: null,
        etag: null,
        lastModified: null,
        createdAt: null,
        updatedAt: null,
      };
      const result = stripPrefixFromObject(obj, username);
      expect(result.key).toBe("photos/");
      expect(result.parentKey).toBeNull();
    });

    it("should keep parentKey null when it's already null", () => {
      const obj = {
        id: 3,
        key: "users/testuser/photos/",
        parentKey: null,
        name: "photos",
        isFolder: true,
        size: null,
        mimeType: null,
        etag: null,
        lastModified: null,
        createdAt: null,
        updatedAt: null,
      };
      const result = stripPrefixFromObject(obj, username);
      expect(result.key).toBe("photos/");
      expect(result.parentKey).toBeNull();
    });

    it("should preserve other object properties", () => {
      const obj = {
        id: 4,
        key: "users/testuser/file.txt",
        parentKey: "users/testuser/",
        name: "file.txt",
        isFolder: false,
        size: 1234,
        mimeType: "text/plain",
        etag: "abc123",
        lastModified: null,
        createdAt: null,
        updatedAt: null,
      };
      const result = stripPrefixFromObject(obj, username);
      expect(result.name).toBe("file.txt");
      expect(result.isFolder).toBe(false);
      expect(result.size).toBe(1234);
      expect(result.mimeType).toBe("text/plain");
    });

    it("should handle deeply nested paths", () => {
      const obj = {
        id: 5,
        key: "users/testuser/a/b/c/deep.txt",
        parentKey: "users/testuser/a/b/c/",
        name: "deep.txt",
        isFolder: false,
        size: null,
        mimeType: null,
        etag: null,
        lastModified: null,
        createdAt: null,
        updatedAt: null,
      };
      const result = stripPrefixFromObject(obj, username);
      expect(result.key).toBe("a/b/c/deep.txt");
      expect(result.parentKey).toBe("a/b/c/");
    });
  });

  describe("multipart upload key construction", () => {
    it("should construct correct key for multipart initiate with parentKey", () => {
      const parentKey = addUserPrefix("docs/", username);
      const sanitizedName = "bigfile.zip";
      const key = `${parentKey}${sanitizedName}`;
      expect(key).toBe("users/testuser/docs/bigfile.zip");
    });

    it("should construct correct key for multipart initiate without parentKey", () => {
      const parentKey = getUserPrefix(username);
      const sanitizedName = "bigfile.zip";
      const key = `${parentKey}${sanitizedName}`;
      expect(key).toBe("users/testuser/bigfile.zip");
    });

    it("should strip user prefix from multipart key in response", () => {
      const key = "users/testuser/docs/bigfile.zip";
      expect(stripUserPrefix(key, username)).toBe("docs/bigfile.zip");
    });
  });

  describe("multipart upload security - filename sanitization", () => {
    it("should sanitize path traversal in fileName by extracting last component", () => {
      expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    });

    it("should sanitize backslash path traversal in fileName", () => {
      expect(sanitizeFileName("..\\..\\etc\\passwd")).toBe("passwd");
    });

    it("should sanitize double dots within filename", () => {
      expect(sanitizeFileName("file..name.txt")).toBe("file_name.txt");
    });

    it("should preserve normal filenames", () => {
      expect(sanitizeFileName("my-document.pdf")).toBe("my-document.pdf");
    });

    it("should extract filename from relative path (folder upload)", () => {
      expect(sanitizeFileName("project/src/index.ts")).toBe("index.ts");
    });

    it("should reject filenames starting with dot", () => {
      const sanitized = sanitizeFileName(".hidden");
      expect(isValidFileName(sanitized)).toBe(false);
    });

    it("should reject empty filename after sanitization", () => {
      const sanitized = sanitizeFileName("///");
      expect(isValidFileName(sanitized)).toBe(false);
    });

    it("should accept valid normal filename", () => {
      const sanitized = sanitizeFileName("document.pdf");
      expect(isValidFileName(sanitized)).toBe(true);
    });

    it("should detect path traversal in parentKey", () => {
      expect(hasPathTraversal("../../../etc/")).toBe(true);
    });

    it("should detect embedded path traversal in parentKey", () => {
      expect(hasPathTraversal("docs/../../../etc/")).toBe(true);
    });

    it("should allow normal parentKey paths", () => {
      expect(hasPathTraversal("docs/projects/")).toBe(false);
    });

    it("should allow single dot in path", () => {
      expect(hasPathTraversal("docs/./file.txt")).toBe(false);
    });
  });

  describe("multipart upload user prefix validation", () => {
    it("should verify presign-part key belongs to user", () => {
      const key = "photos/big.zip";
      const fullKey = addUserPrefix(key, username);
      const userPrefix = getUserPrefix(username);
      expect(fullKey.startsWith(userPrefix)).toBe(true);
    });

    it("should prevent accessing other user's keys via presign-part", () => {
      const key = "users/otheruser/secret.zip";
      const fullKey = addUserPrefix(key, username);
      const userPrefix = getUserPrefix(username);
      expect(fullKey.startsWith(userPrefix)).toBe(true);
      expect(fullKey).toBe("users/testuser/users/otheruser/secret.zip");
    });

    it("should allow key that already has the user prefix", () => {
      const key = "users/testuser/docs/file.zip";
      const fullKey = addUserPrefix(key, username);
      const userPrefix = getUserPrefix(username);
      expect(fullKey.startsWith(userPrefix)).toBe(true);
      expect(fullKey).toBe("users/testuser/docs/file.zip");
    });
  });
});
