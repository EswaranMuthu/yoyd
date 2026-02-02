import { pgTable, text, serial, boolean, timestamp, varchar, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

// === S3 OBJECTS TABLE ===
export const s3Objects = pgTable("s3_objects", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  parentKey: text("parent_key"),
  isFolder: boolean("is_folder").default(false).notNull(),
  size: bigint("size", { mode: "number" }),
  mimeType: text("mime_type"),
  etag: text("etag"),
  lastModified: timestamp("last_modified"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === SCHEMAS ===
export const insertS3ObjectSchema = createInsertSchema(s3Objects).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

// === TYPES ===
export type S3Object = typeof s3Objects.$inferSelect;
export type InsertS3Object = z.infer<typeof insertS3ObjectSchema>;

// Request types
export type CreateFolderRequest = { name: string; parentKey?: string };
export type UploadRequest = { fileName: string; mimeType: string; parentKey?: string };
export type DeleteRequest = { keys: string[] };

// Response types
export type S3ObjectResponse = S3Object;
export type PresignedUrlResponse = { url: string; key: string };
export type SyncResponse = { synced: number; deleted: number };
