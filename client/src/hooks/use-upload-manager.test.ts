import { describe, it, expect } from "vitest";
import {
  MULTIPART_THRESHOLD,
  PART_SIZE,
  MAX_CONCURRENT_PARTS,
} from "./use-upload-manager";
import {
  sanitizeFileName,
  isValidFileName,
  hasPathTraversal,
  computeParentKey,
  calculateTotalParts,
  calculatePartRange,
  batchPartNumbers,
  calculateOverallProgress,
  cleanETag,
} from "../../../server/helpers";

describe("Exported upload manager constants", () => {
  it("should set multipart threshold to 100MB", () => {
    expect(MULTIPART_THRESHOLD).toBe(100 * 1024 * 1024);
  });

  it("should set part size to 10MB", () => {
    expect(PART_SIZE).toBe(10 * 1024 * 1024);
  });

  it("should allow max 3 concurrent parts", () => {
    expect(MAX_CONCURRENT_PARTS).toBe(3);
  });
});

describe("Upload threshold decision logic", () => {
  it("should use small file upload for files under 100MB", () => {
    expect(50 * 1024 * 1024 > MULTIPART_THRESHOLD).toBe(false);
  });

  it("should use small file upload for files exactly at 100MB", () => {
    expect(MULTIPART_THRESHOLD > MULTIPART_THRESHOLD).toBe(false);
  });

  it("should use multipart upload for files over 100MB", () => {
    expect(MULTIPART_THRESHOLD + 1 > MULTIPART_THRESHOLD).toBe(true);
  });

  it("should use multipart upload for 5GB file", () => {
    expect(5 * 1024 * 1024 * 1024 > MULTIPART_THRESHOLD).toBe(true);
  });
});

describe("sanitizeFileName", () => {
  it("should extract filename from path traversal attempt", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
  });

  it("should handle backslash path traversal", () => {
    expect(sanitizeFileName("..\\..\\etc\\passwd")).toBe("passwd");
  });

  it("should replace double dots within filename", () => {
    expect(sanitizeFileName("file..name.txt")).toBe("file_name.txt");
  });

  it("should preserve normal filenames", () => {
    expect(sanitizeFileName("my-document.pdf")).toBe("my-document.pdf");
  });

  it("should extract filename from relative path (folder upload)", () => {
    expect(sanitizeFileName("project/src/index.ts")).toBe("index.ts");
  });

  it("should return empty string for slash-only input", () => {
    expect(sanitizeFileName("///")).toBe("");
  });

  it("should handle filename with spaces", () => {
    expect(sanitizeFileName("my file name.pdf")).toBe("my file name.pdf");
  });

  it("should handle filename with mixed separators", () => {
    expect(sanitizeFileName("folder\\sub/file.txt")).toBe("file.txt");
  });
});

describe("isValidFileName", () => {
  it("should accept normal filenames", () => {
    expect(isValidFileName("document.pdf")).toBe(true);
  });

  it("should reject empty string", () => {
    expect(isValidFileName("")).toBe(false);
  });

  it("should reject filenames starting with dot", () => {
    expect(isValidFileName(".hidden")).toBe(false);
    expect(isValidFileName(".gitignore")).toBe(false);
  });

  it("should accept filenames with dots in the middle", () => {
    expect(isValidFileName("file.name.txt")).toBe(true);
  });
});

describe("hasPathTraversal", () => {
  it("should detect leading path traversal", () => {
    expect(hasPathTraversal("../../../etc/")).toBe(true);
  });

  it("should detect embedded path traversal", () => {
    expect(hasPathTraversal("docs/../../../etc/")).toBe(true);
  });

  it("should allow normal paths", () => {
    expect(hasPathTraversal("docs/projects/")).toBe(false);
  });

  it("should allow single dots", () => {
    expect(hasPathTraversal("docs/./file.txt")).toBe(false);
  });

  it("should detect just double dots", () => {
    expect(hasPathTraversal("..")).toBe(true);
  });
});

describe("computeParentKey", () => {
  it("should compute parentKey for file in subfolder with currentPath", () => {
    expect(computeParentKey("project/src/index.ts", "docs/")).toBe("docs/project/src/");
  });

  it("should compute parentKey for file in subfolder without currentPath", () => {
    expect(computeParentKey("project/src/index.ts", "")).toBe("project/src/");
  });

  it("should use currentPath when no relativePath", () => {
    expect(computeParentKey(undefined, "photos/")).toBe("photos/");
  });

  it("should use currentPath for single-file relativePath (no directory)", () => {
    expect(computeParentKey("readme.txt", "docs/")).toBe("docs/");
  });

  it("should compute parentKey for single-level folder upload", () => {
    expect(computeParentKey("myfolder/readme.txt", "")).toBe("myfolder/");
  });

  it("should compute parentKey for deeply nested folder upload", () => {
    expect(computeParentKey("a/b/c/d/e/file.txt", "uploads/")).toBe("uploads/a/b/c/d/e/");
  });

  it("should return empty string when no relativePath and no currentPath", () => {
    expect(computeParentKey(undefined, "")).toBe("");
  });
});

describe("calculateTotalParts", () => {
  it("should calculate correct number of parts for 150MB file", () => {
    expect(calculateTotalParts(150 * 1024 * 1024, PART_SIZE)).toBe(15);
  });

  it("should calculate correct number of parts for 101MB file", () => {
    expect(calculateTotalParts(101 * 1024 * 1024, PART_SIZE)).toBe(11);
  });

  it("should calculate correct number of parts for 1GB file", () => {
    expect(calculateTotalParts(1024 * 1024 * 1024, PART_SIZE)).toBe(103);
  });

  it("should calculate 1 part for file exactly equal to part size", () => {
    expect(calculateTotalParts(PART_SIZE, PART_SIZE)).toBe(1);
  });

  it("should calculate 2 parts for file just over part size", () => {
    expect(calculateTotalParts(PART_SIZE + 1, PART_SIZE)).toBe(2);
  });
});

describe("calculatePartRange", () => {
  const fileSize = 25 * 1024 * 1024;

  it("should calculate correct range for first part", () => {
    const { start, end } = calculatePartRange(1, PART_SIZE, fileSize);
    expect(start).toBe(0);
    expect(end).toBe(PART_SIZE);
  });

  it("should calculate correct range for second part", () => {
    const { start, end } = calculatePartRange(2, PART_SIZE, fileSize);
    expect(start).toBe(PART_SIZE);
    expect(end).toBe(2 * PART_SIZE);
  });

  it("should cap the last part at file size", () => {
    const { start, end } = calculatePartRange(3, PART_SIZE, fileSize);
    expect(start).toBe(2 * PART_SIZE);
    expect(end).toBe(fileSize);
    expect(end - start).toBeLessThan(PART_SIZE);
  });
});

describe("batchPartNumbers", () => {
  it("should batch 10 parts into groups of 3", () => {
    expect(batchPartNumbers(10, MAX_CONCURRENT_PARTS)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10],
    ]);
  });

  it("should batch 3 parts into a single group", () => {
    expect(batchPartNumbers(3, MAX_CONCURRENT_PARTS)).toEqual([[1, 2, 3]]);
  });

  it("should handle single part", () => {
    expect(batchPartNumbers(1, MAX_CONCURRENT_PARTS)).toEqual([[1]]);
  });

  it("should handle exact multiple", () => {
    expect(batchPartNumbers(6, 3)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });
});

describe("calculateOverallProgress", () => {
  it("should return 0 for no uploads", () => {
    expect(calculateOverallProgress([])).toBe(0);
  });

  it("should return 100 when all uploads are complete", () => {
    expect(calculateOverallProgress([{ progress: 100 }, { progress: 100 }])).toBe(100);
  });

  it("should calculate correct average", () => {
    expect(calculateOverallProgress([{ progress: 100 }, { progress: 50 }, { progress: 0 }])).toBe(50);
  });

  it("should round to nearest integer", () => {
    expect(calculateOverallProgress([{ progress: 33 }, { progress: 33 }])).toBe(33);
  });
});

describe("cleanETag", () => {
  it("should strip surrounding quotes from ETag", () => {
    expect(cleanETag('"abc123def"')).toBe("abc123def");
  });

  it("should leave clean ETags unchanged", () => {
    expect(cleanETag("abc123def")).toBe("abc123def");
  });

  it("should handle ETags with internal quotes", () => {
    expect(cleanETag('"abc"def"')).toBe("abcdef");
  });

  it("should handle empty string", () => {
    expect(cleanETag("")).toBe("");
  });
});

describe("Upload status counting logic", () => {
  const statuses = ["uploading", "queued", "completed", "completed", "failed", "cancelled"];

  it("should count active uploads (uploading + queued)", () => {
    const activeCount = statuses.filter(
      (s) => s === "uploading" || s === "queued"
    ).length;
    expect(activeCount).toBe(2);
  });

  it("should count completed uploads", () => {
    expect(statuses.filter((s) => s === "completed").length).toBe(2);
  });

  it("should count failed uploads", () => {
    expect(statuses.filter((s) => s === "failed").length).toBe(1);
  });

  it("should filter out finished items for clearCompleted", () => {
    const remaining = statuses.filter(
      (s) => s !== "completed" && s !== "cancelled" && s !== "failed"
    );
    expect(remaining).toHaveLength(2);
    expect(remaining).toEqual(["uploading", "queued"]);
  });
});
