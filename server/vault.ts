import { db } from "./db";
import { secretsVault } from "@shared/models/auth";
import { logger } from "./logger";

let cache: Map<string, string> | null = null;
let cacheLoadedAt: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadAll(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) {
    logger.vault.debug("Vault cache hit", { age_ms: now - cacheLoadedAt, keys: cache.size });
    return cache;
  }
  logger.vault.info("Loading secrets from database", { reason: cache ? "cache_expired" : "first_load" });
  try {
    const rows = await db.select({ key: secretsVault.key, value: secretsVault.value }).from(secretsVault);
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.key, row.value);
    }
    cache = map;
    cacheLoadedAt = now;
    logger.vault.info("Vault loaded successfully", { keys_count: map.size, keys: Array.from(map.keys()) });
    return map;
  } catch (err) {
    logger.vault.error("Failed to load secrets from database", err);
    throw err;
  }
}

export async function getSecret(key: string): Promise<string | undefined> {
  const map = await loadAll();
  const found = map.has(key);
  if (!found) {
    logger.vault.warn("Secret not found in vault", { key });
  }
  return map.get(key);
}

export async function getSecrets(keys: string[]): Promise<Record<string, string | undefined>> {
  const map = await loadAll();
  const result: Record<string, string | undefined> = {};
  const missing: string[] = [];
  for (const key of keys) {
    result[key] = map.get(key);
    if (!map.has(key)) missing.push(key);
  }
  if (missing.length > 0) {
    logger.vault.warn("Some requested secrets not found", { missing });
  }
  return result;
}

export function clearVaultCache(): void {
  logger.vault.info("Vault cache cleared");
  cache = null;
  cacheLoadedAt = 0;
}
