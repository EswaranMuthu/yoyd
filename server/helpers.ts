import type { S3Object } from "@shared/schema";

export function getUserPrefix(username: string): string {
  return `users/${username}/`;
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
