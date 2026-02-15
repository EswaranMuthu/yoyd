import { describe, it, expect } from "vitest";
import { getMimeType } from "./s3";

describe("getMimeType", () => {
  it("should return correct mime type for common image formats", () => {
    expect(getMimeType("photo.jpg")).toBe("image/jpeg");
    expect(getMimeType("photo.jpeg")).toBe("image/jpeg");
    expect(getMimeType("icon.png")).toBe("image/png");
    expect(getMimeType("animation.gif")).toBe("image/gif");
    expect(getMimeType("modern.webp")).toBe("image/webp");
    expect(getMimeType("vector.svg")).toBe("image/svg+xml");
  });

  it("should return correct mime type for document formats", () => {
    expect(getMimeType("report.pdf")).toBe("application/pdf");
    expect(getMimeType("letter.doc")).toBe("application/msword");
    expect(getMimeType("letter.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(getMimeType("data.xls")).toBe("application/vnd.ms-excel");
    expect(getMimeType("data.xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(getMimeType("slides.ppt")).toBe("application/vnd.ms-powerpoint");
    expect(getMimeType("slides.pptx")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
  });

  it("should return correct mime type for text and data formats", () => {
    expect(getMimeType("readme.txt")).toBe("text/plain");
    expect(getMimeType("data.csv")).toBe("text/csv");
    expect(getMimeType("config.json")).toBe("application/json");
    expect(getMimeType("config.xml")).toBe("application/xml");
    expect(getMimeType("page.html")).toBe("text/html");
    expect(getMimeType("styles.css")).toBe("text/css");
    expect(getMimeType("app.js")).toBe("application/javascript");
    expect(getMimeType("app.ts")).toBe("application/typescript");
  });

  it("should return correct mime type for media formats", () => {
    expect(getMimeType("song.mp3")).toBe("audio/mpeg");
    expect(getMimeType("sound.wav")).toBe("audio/wav");
    expect(getMimeType("video.mp4")).toBe("video/mp4");
    expect(getMimeType("clip.avi")).toBe("video/x-msvideo");
    expect(getMimeType("movie.mov")).toBe("video/quicktime");
  });

  it("should return correct mime type for archive formats", () => {
    expect(getMimeType("archive.zip")).toBe("application/zip");
    expect(getMimeType("archive.rar")).toBe("application/x-rar-compressed");
    expect(getMimeType("archive.tar")).toBe("application/x-tar");
    expect(getMimeType("archive.gz")).toBe("application/gzip");
  });

  it("should return application/octet-stream for unknown extensions", () => {
    expect(getMimeType("file.xyz")).toBe("application/octet-stream");
    expect(getMimeType("data.bin")).toBe("application/octet-stream");
    expect(getMimeType("unknown.asdf")).toBe("application/octet-stream");
  });

  it("should handle files without extensions", () => {
    expect(getMimeType("Makefile")).toBe("application/octet-stream");
    expect(getMimeType("README")).toBe("application/octet-stream");
  });

  it("should be case-insensitive for extensions", () => {
    expect(getMimeType("PHOTO.JPG")).toBe("image/jpeg");
    expect(getMimeType("file.PNG")).toBe("image/png");
  });

  it("should handle files with multiple dots", () => {
    expect(getMimeType("my.photo.jpg")).toBe("image/jpeg");
    expect(getMimeType("archive.tar.gz")).toBe("application/gzip");
  });

  it("should handle empty string", () => {
    expect(getMimeType("")).toBe("application/octet-stream");
  });
});
