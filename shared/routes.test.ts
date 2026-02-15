import { describe, it, expect } from "vitest";
import { buildUrl, api } from "./routes";

describe("buildUrl", () => {
  it("should return path unchanged when no params", () => {
    expect(buildUrl("/api/objects")).toBe("/api/objects");
  });

  it("should return path unchanged when params is empty object", () => {
    expect(buildUrl("/api/objects", {})).toBe("/api/objects");
  });

  it("should replace a single param", () => {
    expect(buildUrl("/api/objects/:id/download", { id: 42 })).toBe("/api/objects/42/download");
  });

  it("should replace string params", () => {
    expect(buildUrl("/api/objects/:id/download", { id: "abc-123" })).toBe("/api/objects/abc-123/download");
  });

  it("should replace multiple params", () => {
    expect(buildUrl("/api/:type/:id", { type: "objects", id: 5 })).toBe("/api/objects/5");
  });

  it("should leave unmatched params alone", () => {
    expect(buildUrl("/api/objects", { id: 5 })).toBe("/api/objects");
  });

  it("should leave unmatched placeholders alone", () => {
    expect(buildUrl("/api/objects/:id/:action", { id: 5 })).toBe("/api/objects/5/:action");
  });
});

describe("API route definitions", () => {
  it("should have correct paths for object operations", () => {
    expect(api.objects.list.path).toBe("/api/objects");
    expect(api.objects.sync.path).toBe("/api/objects/sync");
    expect(api.objects.createFolder.path).toBe("/api/objects/folder");
    expect(api.objects.uploadUrl.path).toBe("/api/objects/upload-url");
    expect(api.objects.confirmUpload.path).toBe("/api/objects/confirm-upload");
    expect(api.objects.downloadUrl.path).toBe("/api/objects/:id/download");
    expect(api.objects.delete.path).toBe("/api/objects");
  });

  it("should have correct HTTP methods", () => {
    expect(api.objects.list.method).toBe("GET");
    expect(api.objects.sync.method).toBe("POST");
    expect(api.objects.createFolder.method).toBe("POST");
    expect(api.objects.uploadUrl.method).toBe("POST");
    expect(api.objects.confirmUpload.method).toBe("POST");
    expect(api.objects.downloadUrl.method).toBe("GET");
    expect(api.objects.delete.method).toBe("DELETE");
  });

  it("should validate createFolder input correctly", () => {
    const schema = api.objects.createFolder.input;
    
    const valid = schema.safeParse({ name: "my-folder" });
    expect(valid.success).toBe(true);

    const withParent = schema.safeParse({ name: "sub", parentKey: "photos/" });
    expect(withParent.success).toBe(true);

    const emptyName = schema.safeParse({ name: "" });
    expect(emptyName.success).toBe(false);

    const missingName = schema.safeParse({});
    expect(missingName.success).toBe(false);
  });

  it("should validate delete input correctly", () => {
    const schema = api.objects.delete.input;

    const valid = schema.safeParse({ keys: ["photos/sunset.jpg"] });
    expect(valid.success).toBe(true);

    const multiple = schema.safeParse({ keys: ["a.jpg", "b.png", "c/"] });
    expect(multiple.success).toBe(true);

    const emptyArray = schema.safeParse({ keys: [] });
    expect(emptyArray.success).toBe(false);

    const missingKeys = schema.safeParse({});
    expect(missingKeys.success).toBe(false);
  });

  it("should validate uploadUrl input correctly", () => {
    const schema = api.objects.uploadUrl.input;

    const valid = schema.safeParse({ fileName: "photo.jpg", mimeType: "image/jpeg" });
    expect(valid.success).toBe(true);

    const emptyFileName = schema.safeParse({ fileName: "", mimeType: "image/jpeg" });
    expect(emptyFileName.success).toBe(false);

    const missingMimeType = schema.safeParse({ fileName: "photo.jpg" });
    expect(missingMimeType.success).toBe(false);
  });

  it("should validate confirmUpload input correctly", () => {
    const schema = api.objects.confirmUpload.input;

    const valid = schema.safeParse({ key: "photos/sunset.jpg" });
    expect(valid.success).toBe(true);

    const missingKey = schema.safeParse({});
    expect(missingKey.success).toBe(false);
  });
});
