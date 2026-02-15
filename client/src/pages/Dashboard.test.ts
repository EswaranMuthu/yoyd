import { describe, it, expect } from "vitest";
import { formatFileSize, generateBreadcrumbs } from "@/lib/file-utils";

describe("formatFileSize", () => {
  it("should return '-' for null", () => {
    expect(formatFileSize(null)).toBe("-");
  });

  it("should return '0 B' for zero bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("should format bytes correctly", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  it("should format kilobytes correctly", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(10240)).toBe("10 KB");
  });

  it("should format megabytes correctly", () => {
    expect(formatFileSize(1048576)).toBe("1 MB");
    expect(formatFileSize(5242880)).toBe("5 MB");
    expect(formatFileSize(1572864)).toBe("1.5 MB");
  });

  it("should format gigabytes correctly", () => {
    expect(formatFileSize(1073741824)).toBe("1 GB");
    expect(formatFileSize(2147483648)).toBe("2 GB");
  });

  it("should format terabytes correctly", () => {
    expect(formatFileSize(1099511627776)).toBe("1 TB");
  });

  it("should handle very small values", () => {
    expect(formatFileSize(1)).toBe("1 B");
  });
});

describe("breadcrumb path generation", () => {
  it("should return empty array for root path", () => {
    expect(generateBreadcrumbs("")).toEqual([]);
  });

  it("should generate single breadcrumb for one level", () => {
    const result = generateBreadcrumbs("photos/");
    expect(result).toEqual([{ name: "photos", path: "photos/" }]);
  });

  it("should generate multiple breadcrumbs for nested paths", () => {
    const result = generateBreadcrumbs("photos/vacation/");
    expect(result).toEqual([
      { name: "photos", path: "photos/" },
      { name: "vacation", path: "photos/vacation/" },
    ]);
  });

  it("should handle deeply nested paths", () => {
    const result = generateBreadcrumbs("photos/2024/summer/beach/");
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ name: "photos", path: "photos/" });
    expect(result[3]).toEqual({ name: "beach", path: "photos/2024/summer/beach/" });
  });
});
