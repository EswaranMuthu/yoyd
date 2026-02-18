import type { S3Object } from "@shared/schema";

export function getUserPrefix(username: string): string {
  return `users/${username}/`;
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\\]/g, "/").split("/").pop()?.replace(/\.\./g, "_") || "";
}

export function isValidFileName(sanitized: string): boolean {
  return !!sanitized && !sanitized.startsWith(".");
}

export function hasPathTraversal(path: string): boolean {
  return /\.\./.test(path);
}

export function computeParentKey(relativePath: string | undefined, currentPath: string): string {
  if (!relativePath) return currentPath;
  const parts = relativePath.split("/");
  if (parts.length > 1) {
    const folderPath = parts.slice(0, -1).join("/") + "/";
    return currentPath ? currentPath + folderPath : folderPath;
  }
  return currentPath;
}

export function calculateTotalParts(fileSize: number, partSize: number): number {
  return Math.ceil(fileSize / partSize);
}

export function calculatePartRange(partNumber: number, partSize: number, fileSize: number): { start: number; end: number } {
  const start = (partNumber - 1) * partSize;
  const end = Math.min(start + partSize, fileSize);
  return { start, end };
}

export function batchPartNumbers(totalParts: number, concurrency: number): number[][] {
  const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
  const batches: number[][] = [];
  for (let i = 0; i < partNumbers.length; i += concurrency) {
    batches.push(partNumbers.slice(i, i + concurrency));
  }
  return batches;
}

export function calculateOverallProgress(uploads: { progress: number }[]): number {
  if (uploads.length === 0) return 0;
  return Math.round(uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length);
}

export function cleanETag(etag: string): string {
  return etag.replace(/"/g, "");
}

export function addUserPrefix(key: string, username: string): string {
  const prefix = getUserPrefix(username);
  if (key.startsWith(prefix)) return key;
  return `${prefix}${key}`;
}

export function stripUserPrefix(key: string, username: string): string {
  const prefix = getUserPrefix(username);
  if (key.startsWith(prefix)) {
    return key.slice(prefix.length);
  }
  return key;
}

export function stripPrefixFromObject(obj: S3Object, username: string): S3Object {
  const prefix = getUserPrefix(username);
  let strippedParentKey: string | null = null;
  if (obj.parentKey) {
    const stripped = stripUserPrefix(obj.parentKey, username);
    strippedParentKey = stripped === "" ? null : stripped;
  }
  return {
    ...obj,
    key: stripUserPrefix(obj.key, username),
    parentKey: strippedParentKey,
  };
}
