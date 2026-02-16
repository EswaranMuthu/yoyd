import { db } from "./db";
import { secretsVault } from "@shared/models/auth";

let cache: Map<string, string> | null = null;
let cacheLoadedAt: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadAll(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cache;
  }
  const rows = await db.select({ key: secretsVault.key, value: secretsVault.value }).from(secretsVault);
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }
  cache = map;
  cacheLoadedAt = now;
  return map;
}

export async function getSecret(key: string): Promise<string | undefined> {
  const map = await loadAll();
  return map.get(key);
}

export async function getSecrets(keys: string[]): Promise<Record<string, string | undefined>> {
  const map = await loadAll();
  const result: Record<string, string | undefined> = {};
  for (const key of keys) {
    result[key] = map.get(key);
  }
  return result;
}

export function clearVaultCache(): void {
  cache = null;
  cacheLoadedAt = 0;
}
