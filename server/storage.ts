import { s3Objects, type S3Object, type InsertS3Object } from "@shared/schema";
import { db } from "./db";
import { eq, and, like, isNull } from "drizzle-orm";

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
}

export class DatabaseStorage implements IStorage {
  async getObjects(parentKey?: string | null): Promise<S3Object[]> {
    if (parentKey === null || parentKey === undefined || parentKey === "") {
      return await db.select().from(s3Objects).where(isNull(s3Objects.parentKey));
    }
    return await db.select().from(s3Objects).where(eq(s3Objects.parentKey, parentKey));
  }

  async getObjectsByPrefix(parentKey: string): Promise<S3Object[]> {
    return await db.select().from(s3Objects).where(eq(s3Objects.parentKey, parentKey));
  }

  async getObjectsByKeyPrefix(prefix: string): Promise<S3Object[]> {
    return await db.select().from(s3Objects).where(like(s3Objects.key, `${prefix}%`));
  }

  async getObject(id: number): Promise<S3Object | undefined> {
    const [object] = await db.select().from(s3Objects).where(eq(s3Objects.id, id));
    return object;
  }

  async getObjectByKey(key: string): Promise<S3Object | undefined> {
    const [object] = await db.select().from(s3Objects).where(eq(s3Objects.key, key));
    return object;
  }

  async createObject(insertObject: InsertS3Object): Promise<S3Object> {
    const [object] = await db.insert(s3Objects).values(insertObject).returning();
    return object;
  }

  async updateObject(key: string, updates: Partial<InsertS3Object>): Promise<S3Object | undefined> {
    const [object] = await db
      .update(s3Objects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(s3Objects.key, key))
      .returning();
    return object;
  }

  async deleteObject(key: string): Promise<void> {
    await db.delete(s3Objects).where(eq(s3Objects.key, key));
  }

  async deleteObjectsByPrefix(prefix: string): Promise<void> {
    await db.delete(s3Objects).where(like(s3Objects.key, `${prefix}%`));
  }

  async upsertObject(insertObject: InsertS3Object): Promise<S3Object> {
    const existing = await this.getObjectByKey(insertObject.key);
    if (existing) {
      const updated = await this.updateObject(insertObject.key, insertObject);
      return updated || existing;
    }
    return await this.createObject(insertObject);
  }

  async getAllObjects(): Promise<S3Object[]> {
    return await db.select().from(s3Objects);
  }

  async clearAllObjects(): Promise<void> {
    await db.delete(s3Objects);
  }
}

export const storage = new DatabaseStorage();
