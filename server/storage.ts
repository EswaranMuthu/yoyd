import { s3Objects, type S3Object, type InsertS3Object } from "@shared/schema";
import { db } from "./db";
import { eq, like, isNull, sql, and, or } from "drizzle-orm";
import { logger } from "./logger";

export interface IStorage {
  getObjects(parentKey?: string | null): Promise<S3Object[]>;
  getObject(id: number): Promise<S3Object | undefined>;
  getObjectByKey(key: string): Promise<S3Object | undefined>;
  getObjectsByPrefix(parentKey: string): Promise<S3Object[]>;
  getObjectsByKeyPrefix(prefix: string): Promise<S3Object[]>;
  createObject(object: InsertS3Object): Promise<S3Object>;
  updateObject(key: string, updates: Partial<InsertS3Object>): Promise<S3Object | undefined>;
  deleteObject(key: string): Promise<void>;
  deleteObjectsByPrefix(prefix: string): Promise<void>;
  upsertObject(object: InsertS3Object): Promise<S3Object>;
  getAllObjects(): Promise<S3Object[]>;
  clearAllObjects(): Promise<void>;
  getTotalStorageForUser(userPrefix: string): Promise<number>;
  getFolderSizes(userPrefix: string, parentKey: string): Promise<Map<string, number>>;
}

export class DatabaseStorage implements IStorage {
  async getObjects(parentKey?: string | null): Promise<S3Object[]> {
    logger.storage.debug("getObjects", { parentKey: parentKey ?? "(root)" });
    if (parentKey === null || parentKey === undefined || parentKey === "") {
      return await db.select().from(s3Objects).where(isNull(s3Objects.parentKey));
    }
    return await db.select().from(s3Objects).where(eq(s3Objects.parentKey, parentKey));
  }

  async getObjectsByPrefix(parentKey: string): Promise<S3Object[]> {
    logger.storage.debug("getObjectsByPrefix", { parentKey });
    return await db.select().from(s3Objects).where(eq(s3Objects.parentKey, parentKey));
  }

  async getObjectsByKeyPrefix(prefix: string): Promise<S3Object[]> {
    logger.storage.debug("getObjectsByKeyPrefix", { prefix });
    return await db.select().from(s3Objects).where(like(s3Objects.key, `${prefix}%`));
  }

  async getObject(id: number): Promise<S3Object | undefined> {
    const [object] = await db.select().from(s3Objects).where(eq(s3Objects.id, id));
    if (!object) {
      logger.storage.debug("getObject - not found", { id });
    }
    return object;
  }

  async getObjectByKey(key: string): Promise<S3Object | undefined> {
    const [object] = await db.select().from(s3Objects).where(eq(s3Objects.key, key));
    return object;
  }

  async createObject(insertObject: InsertS3Object): Promise<S3Object> {
    logger.storage.debug("createObject", { key: insertObject.key, isFolder: insertObject.isFolder });
    const [object] = await db.insert(s3Objects).values(insertObject).returning();
    return object;
  }

  async updateObject(key: string, updates: Partial<InsertS3Object>): Promise<S3Object | undefined> {
    logger.storage.debug("updateObject", { key });
    const [object] = await db
      .update(s3Objects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(s3Objects.key, key))
      .returning();
    return object;
  }

  async deleteObject(key: string): Promise<void> {
    logger.storage.debug("deleteObject", { key });
    await db.delete(s3Objects).where(eq(s3Objects.key, key));
  }

  async deleteObjectsByPrefix(prefix: string): Promise<void> {
    logger.storage.info("deleteObjectsByPrefix", { prefix });
    await db.delete(s3Objects).where(like(s3Objects.key, `${prefix}%`));
  }

  async upsertObject(insertObject: InsertS3Object): Promise<S3Object> {
    const existing = await this.getObjectByKey(insertObject.key);
    if (existing) {
      logger.storage.debug("upsertObject - updating existing", { key: insertObject.key });
      const updated = await this.updateObject(insertObject.key, insertObject);
      return updated || existing;
    }
    logger.storage.debug("upsertObject - creating new", { key: insertObject.key });
    return await this.createObject(insertObject);
  }

  async getAllObjects(): Promise<S3Object[]> {
    logger.storage.debug("getAllObjects");
    return await db.select().from(s3Objects);
  }

  async clearAllObjects(): Promise<void> {
    logger.storage.warn("clearAllObjects - removing all objects from database");
    await db.delete(s3Objects);
  }

  async getTotalStorageForUser(userPrefix: string): Promise<number> {
    logger.storage.debug("getTotalStorageForUser", { userPrefix });
    const result = await db
      .select({ total: sql<string>`COALESCE(SUM(${s3Objects.size}), 0)` })
      .from(s3Objects)
      .where(and(like(s3Objects.key, `${userPrefix}%`), eq(s3Objects.isFolder, false)));
    return Number(result[0]?.total ?? 0);
  }

  async getFolderSizes(userPrefix: string, parentKey: string): Promise<Map<string, number>> {
    logger.storage.debug("getFolderSizes", { userPrefix, parentKey });
    const folders = await db
      .select({ key: s3Objects.key })
      .from(s3Objects)
      .where(and(eq(s3Objects.parentKey, parentKey), eq(s3Objects.isFolder, true)));

    if (folders.length === 0) return new Map();

    const conditions = folders.map(
      (f) => sql`WHEN ${s3Objects.key} LIKE ${f.key + '%'} THEN ${f.key}`
    );

    const likeConditions = folders.map(
      (f) => like(s3Objects.key, `${f.key}%`)
    );

    const results = await db
      .select({
        folder: sql<string>`CASE ${sql.join(conditions, sql` `)} ELSE NULL END`,
        total: sql<string>`COALESCE(SUM(${s3Objects.size}), 0)`,
      })
      .from(s3Objects)
      .where(and(or(...likeConditions), eq(s3Objects.isFolder, false)))
      .groupBy(sql`CASE ${sql.join(conditions, sql` `)} ELSE NULL END`);

    const sizeMap = new Map<string, number>();
    for (const f of folders) {
      sizeMap.set(f.key, 0);
    }
    for (const row of results) {
      if (row.folder) {
        sizeMap.set(row.folder, Number(row.total));
      }
    }
    return sizeMap;
  }
}

export const storage = new DatabaseStorage();
