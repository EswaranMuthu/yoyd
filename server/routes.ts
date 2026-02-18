import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { registerAuthRoutes } from "./auth/routes";
import { isAuthenticated } from "./auth/middleware";
import { z } from "zod";
import { logger } from "./logger";
import {
  listS3Objects,
  listAllS3Objects,
  createFolder as createS3Folder,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  deleteS3Object,
  deleteS3Objects,
  getObjectMetadata,
  getMimeType,
  uploadToS3,
  initiateMultipartUpload,
  getPresignedPartUrl,
  completeMultipartUpload as completeS3Multipart,
  abortMultipartUpload as abortS3Multipart,
} from "./s3";
import { getUserPrefix, addUserPrefix, stripUserPrefix, stripPrefixFromObject, sanitizeFileName, isValidFileName, hasPathTraversal, cleanETag } from "./helpers";
import type { InsertS3Object, S3Object } from "@shared/schema";
import { users, billingRecords, stripeEvents } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { authStorage } from "./auth/storage";
import { createStripeCustomer, createCheckoutSession, hasPaymentMethod, constructWebhookEvent } from "./stripe";

async function recalcUserStorage(username: string) {
  try {
    const userPrefix = getUserPrefix(username);
    const totalBytes = await storage.getTotalStorageForUser(userPrefix);
    await authStorage.updateUserStorageBytes(username, totalBytes);
    logger.routes.debug("Updated user storage", { user: username, totalBytes });
  } catch (err: any) {
    logger.routes.error("Failed to update user storage bytes", err, { user: username });
  }
}

async function ensureIntermediateFolders(fullKey: string, username: string) {
  const userPrefix = getUserPrefix(username);
  const parts = fullKey.slice(userPrefix.length).split("/").filter(Boolean);
  if (parts.length <= 1) return;

  let accumulated = userPrefix;
  for (let i = 0; i < parts.length - 1; i++) {
    accumulated += parts[i] + "/";
    const existing = await storage.getObjectByKey(accumulated);
    if (!existing) {
      logger.routes.debug("Auto-creating folder for upload", { user: username, folder: stripUserPrefix(accumulated, username) });
      try {
        await createS3Folder(accumulated);
      } catch {
      }
      const folderParts = accumulated.split("/").filter(Boolean);
      let parentKey: string | null = null;
      if (folderParts.length > 1) {
        parentKey = folderParts.slice(0, -1).join("/") + "/";
      }
      await storage.upsertObject({
        key: accumulated,
        name: parts[i],
        parentKey,
        isFolder: true,
        size: null,
        mimeType: null,
        etag: null,
        lastModified: new Date(),
      });
    }
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  registerAuthRoutes(app);

  app.get(api.objects.list.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const userPrefix = getUserPrefix(username);
      const clientPrefix = (req.query.prefix as string) || "";
      const fullPrefix = clientPrefix ? addUserPrefix(clientPrefix, username) : userPrefix;

      logger.routes.debug("List objects", { user: username, prefix: clientPrefix || "/" });
      const objects = await storage.getObjectsByPrefix(fullPrefix);
      const stripped = objects.map((obj) => stripPrefixFromObject(obj, username));
      logger.routes.debug("List objects result", { user: username, count: stripped.length });
      res.json(stripped);
    } catch (error) {
      logger.routes.error("Failed to list objects", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to list objects" });
    }
  });

  app.get("/api/objects/storage-stats", isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const userPrefix = getUserPrefix(username);
      const clientPrefix = (req.query.prefix as string) || "";
      const fullPrefix = clientPrefix ? addUserPrefix(clientPrefix, username) : userPrefix;

      const [totalBytes, folderSizesMap] = await Promise.all([
        storage.getTotalStorageForUser(userPrefix),
        storage.getFolderSizes(userPrefix, fullPrefix),
      ]);

      const folderSizes: Record<string, number> = {};
      for (const [key, size] of folderSizesMap) {
        const stripped = stripUserPrefix(key, username);
        folderSizes[stripped] = size;
      }

      res.json({ totalBytes, folderSizes });
    } catch (error) {
      logger.routes.error("Failed to get storage stats", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to get storage stats" });
    }
  });

  app.post(api.objects.sync.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const userPrefix = getUserPrefix(username);
      logger.routes.info("Sync started", { user: username });

      try {
        await createS3Folder(userPrefix);
        const defaultFolders = ["downloads/", "documents/", "photos/"];
        for (const folder of defaultFolders) {
          await createS3Folder(`${userPrefix}${folder}`);
        }
        logger.routes.debug("Default folders ensured", { user: username });
      } catch (folderErr) {
        logger.routes.error("Failed to create default user folders", folderErr, { user: username });
      }

      const s3Objects = await listAllS3Objects(userPrefix);
      const dbObjects = await storage.getObjectsByKeyPrefix(userPrefix);
      const s3KeySet = new Set(s3Objects.map((o) => o.key));

      let synced = 0;
      let deleted = 0;

      for (const s3Obj of s3Objects) {
        if (s3Obj.key === userPrefix) continue;

        const parts = s3Obj.key.split("/").filter((p) => p);
        const name = parts[parts.length - 1] || s3Obj.key;

        let parentKey: string | null = null;
        if (parts.length > 1) {
          parentKey = parts.slice(0, -1).join("/") + "/";
        }

        const insertObj: InsertS3Object = {
          key: s3Obj.key,
          name,
          parentKey,
          isFolder: s3Obj.isFolder,
          size: s3Obj.size ?? null,
          mimeType: s3Obj.isFolder ? null : getMimeType(name),
          etag: s3Obj.etag ?? null,
          lastModified: s3Obj.lastModified ?? null,
        };

        await storage.upsertObject(insertObj);
        synced++;
      }

      for (const dbObj of dbObjects) {
        if (dbObj.key === userPrefix) continue;
        if (!s3KeySet.has(dbObj.key)) {
          await storage.deleteObject(dbObj.key);
          deleted++;
        }
      }

      logger.routes.info("Sync completed", { user: username, synced, deleted, s3_total: s3Objects.length, db_total: dbObjects.length });
      recalcUserStorage(username).catch(() => {});
      res.json({ synced, deleted });
    } catch (error: any) {
      logger.routes.error("Sync failed", error, { user: req.authUser?.username });
      const detail = error?.message || "Unknown error";
      res.status(500).json({ message: `Failed to sync objects: ${detail}` });
    }
  });

  app.post(api.objects.createFolder.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const input = api.objects.createFolder.input.parse(req.body);
      logger.routes.info("Create folder", { user: username, name: input.name, parentKey: input.parentKey || "/" });

      const parentKey = input.parentKey
        ? addUserPrefix(input.parentKey, username)
        : getUserPrefix(username);

      const folderKey = `${parentKey}${input.name}/`;

      await createS3Folder(folderKey);

      const parts = folderKey.split("/").filter((p) => p);
      let dbParentKey: string | null = null;
      if (parts.length > 1) {
        dbParentKey = parts.slice(0, -1).join("/") + "/";
      }

      const insertObj: InsertS3Object = {
        key: folderKey,
        name: input.name,
        parentKey: dbParentKey,
        isFolder: true,
        size: null,
        mimeType: null,
        etag: null,
        lastModified: new Date(),
      };

      const folder = await storage.createObject(insertObj);
      logger.routes.info("Folder created", { user: username, key: folderKey });
      res.status(201).json(stripPrefixFromObject(folder, username));
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.routes.warn("Create folder validation failed", { errors: error.errors });
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      logger.routes.error("Failed to create folder", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  app.post(api.objects.uploadUrl.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const input = api.objects.uploadUrl.input.parse(req.body);
      logger.routes.debug("Upload URL requested", { user: username, fileName: input.fileName, mimeType: input.mimeType });

      const parentKey = input.parentKey
        ? addUserPrefix(input.parentKey, username)
        : getUserPrefix(username);

      const key = `${parentKey}${input.fileName}`;

      const url = await getPresignedUploadUrl(key, input.mimeType);
      res.json({ url, key: stripUserPrefix(key, username) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      logger.routes.error("Failed to generate upload URL", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

  app.post("/api/objects/upload", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      const username = req.authUser!.username;
      const file = req.file;
      if (!file) {
        logger.routes.warn("Upload attempted with no file", { user: username });
        return res.status(400).json({ message: "No file provided" });
      }

      logger.routes.info("File upload started", { user: username, fileName: file.originalname, size_bytes: file.size, mimeType: file.mimetype });

      const sanitizedName = file.originalname.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
      if (!sanitizedName || sanitizedName.startsWith(".")) {
        logger.routes.warn("Upload rejected - invalid filename", { user: username, original: file.originalname, sanitized: sanitizedName });
        return res.status(400).json({ message: "Invalid file name" });
      }

      if (req.body.parentKey && /\.\./.test(req.body.parentKey)) {
        logger.routes.warn("Upload rejected - path traversal in parentKey", { user: username, parentKey: req.body.parentKey });
        return res.status(400).json({ message: "Invalid parent path" });
      }

      const parentKey = req.body.parentKey
        ? addUserPrefix(req.body.parentKey, username)
        : getUserPrefix(username);

      const key = `${parentKey}${sanitizedName}`;
      const contentType = file.mimetype || "application/octet-stream";

      await uploadToS3(key, file.buffer, contentType);
      await ensureIntermediateFolders(key, username);

      const strippedKey = stripUserPrefix(key, username);
      const parts = key.split("/").filter((p: string) => p);
      const name = parts[parts.length - 1] || key;
      let objParentKey: string | null = null;
      if (parts.length > 1) {
        objParentKey = parts.slice(0, -1).join("/") + "/";
      }

      const insertObj: InsertS3Object = {
        key,
        name,
        parentKey: objParentKey,
        isFolder: false,
        size: file.size,
        mimeType: contentType,
        etag: null,
        lastModified: new Date(),
      };

      const object = await storage.upsertObject(insertObj);
      logger.routes.info("File upload completed", { user: username, key: strippedKey, size_bytes: file.size });
      recalcUserStorage(username).catch(() => {});
      authStorage.addConsumedBytes(username, file.size).catch(() => {});
      res.json(stripPrefixFromObject(object, username));
    } catch (error) {
      logger.routes.error("File upload failed", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  app.post(api.objects.confirmUpload.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const input = api.objects.confirmUpload.input.parse(req.body);
      const fullKey = addUserPrefix(input.key, username);
      logger.routes.debug("Confirm upload", { user: username, key: input.key });

      const metadata = await getObjectMetadata(fullKey);

      if (!metadata) {
        logger.routes.warn("Confirm upload failed - object not found in S3", { user: username, key: fullKey });
        return res.status(400).json({ message: "Object not found in S3" });
      }

      await ensureIntermediateFolders(fullKey, username);

      const parts = fullKey.split("/").filter((p) => p);
      const name = parts[parts.length - 1] || fullKey;
      let parentKey: string | null = null;
      if (parts.length > 1) {
        parentKey = parts.slice(0, -1).join("/") + "/";
      }

      const insertObj: InsertS3Object = {
        key: fullKey,
        name,
        parentKey,
        isFolder: false,
        size: metadata.size ?? null,
        mimeType: metadata.mimeType ?? getMimeType(name),
        etag: metadata.etag ?? null,
        lastModified: metadata.lastModified ?? new Date(),
      };

      const object = await storage.upsertObject(insertObj);
      logger.routes.debug("Upload confirmed", { user: username, key: input.key, size: metadata.size });
      recalcUserStorage(username).catch(() => {});
      if (metadata.size) authStorage.addConsumedBytes(username, metadata.size).catch(() => {});
      res.json(stripPrefixFromObject(object, username));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      logger.routes.error("Failed to confirm upload", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to confirm upload" });
    }
  });

  app.get(api.objects.downloadUrl.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const userPrefix = getUserPrefix(username);
      const id = Number(req.params.id);
      logger.routes.debug("Download URL requested", { user: username, objectId: id });
      const object = await storage.getObject(id);

      if (!object) {
        logger.routes.warn("Download failed - object not found", { user: username, objectId: id });
        return res.status(404).json({ message: "Object not found" });
      }

      if (!object.key.startsWith(userPrefix)) {
        logger.routes.warn("Download denied - access violation", { user: username, objectId: id, key: object.key });
        return res.status(403).json({ message: "Access denied" });
      }

      if (object.isFolder) {
        return res.status(400).json({ message: "Cannot download a folder" });
      }

      const url = await getPresignedDownloadUrl(object.key);
      logger.routes.debug("Download URL generated", { user: username, key: stripUserPrefix(object.key, username) });
      res.json({ url });
    } catch (error) {
      logger.routes.error("Failed to generate download URL", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to generate download URL" });
    }
  });

  app.delete(api.objects.delete.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const userPrefix = getUserPrefix(username);
      const input = api.objects.delete.input.parse(req.body);
      logger.routes.info("Delete requested", { user: username, keys: input.keys });
      
      const allKeysToDelete: string[] = [];
      
      for (const clientKey of input.keys) {
        const fullKey = addUserPrefix(clientKey, username);

        if (!fullKey.startsWith(userPrefix)) {
          logger.routes.warn("Delete denied - access violation", { user: username, key: clientKey });
          return res.status(403).json({ message: "Access denied" });
        }

        allKeysToDelete.push(fullKey);
        if (fullKey.endsWith("/")) {
          const s3Objects = await listAllS3Objects(fullKey);
          for (const obj of s3Objects) {
            allKeysToDelete.push(obj.key);
          }
        }
      }

      const uniqueKeys = Array.from(new Set(allKeysToDelete));

      if (uniqueKeys.length > 0) {
        await deleteS3Objects(uniqueKeys);
        for (const key of uniqueKeys) {
          await storage.deleteObject(key);
        }
      }

      logger.routes.info("Delete completed", { user: username, deleted: uniqueKeys.length });
      recalcUserStorage(username).catch(() => {});
      res.json({ deleted: uniqueKeys.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      logger.routes.error("Delete failed", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to delete objects" });
    }
  });

  app.post(api.objects.initiateMultipart.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const input = api.objects.initiateMultipart.input.parse(req.body);
      logger.routes.info("Multipart upload initiate", { user: username, fileName: input.fileName, mimeType: input.mimeType });

      const sanitizedName = sanitizeFileName(input.fileName);
      if (!isValidFileName(sanitizedName)) {
        logger.routes.warn("Multipart rejected - invalid filename", { user: username, original: input.fileName, sanitized: sanitizedName });
        return res.status(400).json({ message: "Invalid file name" });
      }

      if (input.parentKey && hasPathTraversal(input.parentKey)) {
        logger.routes.warn("Multipart rejected - path traversal", { user: username, parentKey: input.parentKey });
        return res.status(400).json({ message: "Invalid parent path" });
      }

      const parentKey = input.parentKey
        ? addUserPrefix(input.parentKey, username)
        : getUserPrefix(username);

      const key = `${parentKey}${sanitizedName}`;
      const uploadId = await initiateMultipartUpload(key, input.mimeType);

      logger.routes.info("Multipart upload initiated", { user: username, key: stripUserPrefix(key, username), uploadId });
      res.json({ uploadId, key: stripUserPrefix(key, username) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      logger.routes.error("Failed to initiate multipart upload", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to initiate multipart upload" });
    }
  });

  app.post(api.objects.presignPart.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const userPrefix = getUserPrefix(username);
      const input = api.objects.presignPart.input.parse(req.body);

      const fullKey = addUserPrefix(input.key, username);
      if (!fullKey.startsWith(userPrefix)) {
        logger.routes.warn("Presign part denied - access violation", { user: username, key: input.key });
        return res.status(403).json({ message: "Access denied" });
      }

      logger.routes.debug("Presigning part", { user: username, key: input.key, partNumber: input.partNumber });
      const url = await getPresignedPartUrl(fullKey, input.uploadId, input.partNumber);
      res.json({ url });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      logger.routes.error("Failed to presign part", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to presign part" });
    }
  });

  app.post(api.objects.completeMultipart.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const userPrefix = getUserPrefix(username);
      const input = api.objects.completeMultipart.input.parse(req.body);

      const fullKey = addUserPrefix(input.key, username);
      if (!fullKey.startsWith(userPrefix)) {
        logger.routes.warn("Complete multipart denied - access violation", { user: username, key: input.key });
        return res.status(403).json({ message: "Access denied" });
      }

      logger.routes.info("Completing multipart upload", { user: username, key: input.key, totalParts: input.parts.length });
      await completeS3Multipart(fullKey, input.uploadId, input.parts);
      await ensureIntermediateFolders(fullKey, username);

      const metadata = await getObjectMetadata(fullKey);
      const parts = fullKey.split("/").filter((p) => p);
      const name = parts[parts.length - 1] || fullKey;
      let parentKey: string | null = null;
      if (parts.length > 1) {
        parentKey = parts.slice(0, -1).join("/") + "/";
      }

      const insertObj: InsertS3Object = {
        key: fullKey,
        name,
        parentKey,
        isFolder: false,
        size: metadata?.size ?? null,
        mimeType: metadata?.mimeType ?? getMimeType(name),
        etag: metadata?.etag ?? null,
        lastModified: metadata?.lastModified ?? new Date(),
      };

      const object = await storage.upsertObject(insertObj);
      logger.routes.info("Multipart upload completed", { user: username, key: input.key, size: metadata?.size });
      recalcUserStorage(username).catch(() => {});
      if (metadata?.size) authStorage.addConsumedBytes(username, metadata.size).catch(() => {});
      res.json(stripPrefixFromObject(object, username));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      logger.routes.error("Failed to complete multipart upload", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to complete multipart upload" });
    }
  });

  app.post(api.objects.abortMultipart.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const userPrefix = getUserPrefix(username);
      const input = api.objects.abortMultipart.input.parse(req.body);

      const fullKey = addUserPrefix(input.key, username);
      if (!fullKey.startsWith(userPrefix)) {
        logger.routes.warn("Abort multipart denied - access violation", { user: username, key: input.key });
        return res.status(403).json({ message: "Access denied" });
      }

      logger.routes.warn("Aborting multipart upload", { user: username, key: input.key, uploadId: input.uploadId });
      await abortS3Multipart(fullKey, input.uploadId);
      logger.routes.info("Multipart upload aborted", { user: username, key: input.key });
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      logger.routes.error("Failed to abort multipart upload", error, { user: req.authUser?.username });
      res.status(500).json({ message: "Failed to abort multipart upload" });
    }
  });

  // === STRIPE BILLING ROUTES ===

  app.post("/api/stripe/checkout-session", isAuthenticated, async (req, res) => {
    try {
      const user = req.authUser!;
      const dbUser = await authStorage.getUserByUsername(user.username);
      if (!dbUser) return res.status(404).json({ message: "User not found" });

      let stripeCustomerId = dbUser.stripeCustomerId;
      if (!stripeCustomerId) {
        stripeCustomerId = await createStripeCustomer(dbUser.email, dbUser.username);
        await authStorage.updateStripeCustomerId(dbUser.id, stripeCustomerId);
      }

      const origin = `${req.protocol}://${req.get("host")}`;
      const { sessionId, url } = await createCheckoutSession(
        stripeCustomerId,
        `${origin}/dashboard?payment=success`,
        `${origin}/dashboard?payment=cancelled`,
      );

      res.json({ sessionId, url });
    } catch (error: any) {
      logger.routes.error("Failed to create checkout session", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.get("/api/stripe/payment-status", isAuthenticated, async (req, res) => {
    try {
      const user = req.authUser!;
      const dbUser = await authStorage.getUserByUsername(user.username);
      if (!dbUser) return res.status(404).json({ message: "User not found" });

      const FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024;
      const consumed = dbUser.monthlyConsumedBytes ?? 0;
      const exceededFreeTier = consumed > FREE_TIER_BYTES;

      let hasCard = false;
      if (dbUser.stripeCustomerId) {
        hasCard = await hasPaymentMethod(dbUser.stripeCustomerId);
      }

      res.json({
        hasCard,
        exceededFreeTier,
        monthlyConsumedBytes: consumed,
        needsPaymentMethod: exceededFreeTier && !hasCard,
      });
    } catch (error: any) {
      logger.routes.error("Failed to check payment status", error);
      res.status(500).json({ message: "Failed to check payment status" });
    }
  });

  app.post("/api/stripe/test-billing", isAuthenticated, async (req, res) => {
    try {
      const userId = req.authUser!.id;
      const dbUser = await authStorage.getUserById(userId);
      if (!dbUser) return res.status(404).json({ message: "User not found" });

      if (!dbUser.stripeCustomerId) {
        return res.status(400).json({ message: "No Stripe customer ID. Please add a payment method first." });
      }

      const testBytes = 20 * 1024 * 1024 * 1024; // 20 GB
      await db.update(users)
        .set({ monthlyConsumedBytes: testBytes, updatedAt: new Date() })
        .where(eq(users.id, userId));

      logger.routes.info("Test billing: set storage to 20GB", { user: dbUser.username, bytes: testBytes });

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const existing = await db.select({ id: billingRecords.id })
        .from(billingRecords)
        .where(and(
          eq(billingRecords.userId, userId),
          eq(billingRecords.year, year),
          eq(billingRecords.month, month),
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.delete(billingRecords).where(eq(billingRecords.id, existing[0].id));
        logger.routes.info("Test billing: cleared existing billing record", { user: dbUser.username, year, month });
      }

      const { runMonthlyBilling } = await import("./billing");
      const result = await runMonthlyBilling(year, month);

      logger.routes.info("Test billing completed", { result });

      res.json({
        message: "Test billing completed",
        simulatedUsageGB: 20,
        freeGB: 10,
        billableGB: 10,
        estimatedCostDollars: 1.00,
        billingResult: result,
      });
    } catch (error: any) {
      logger.routes.error("Test billing failed", error);
      res.status(500).json({ message: error.message || "Test billing failed" });
    }
  });

  app.post("/api/stripe/webhook", async (req, res) => {
    try {
      const signature = req.headers["stripe-signature"] as string;
      if (!signature) return res.status(400).json({ message: "Missing signature" });

      const event = constructWebhookEvent(req.rawBody as Buffer, signature);
      const obj = event.data.object as any;

      const stripeCustomerId = obj.customer || null;
      let invoiceId: string | null = null;
      let amountCents: number | null = null;
      let status: string | null = null;

      let matchedUser = null;
      if (stripeCustomerId) {
        const found = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, stripeCustomerId)).limit(1);
        if (found.length > 0) matchedUser = found[0].id;
      }

      switch (event.type) {
        case "checkout.session.completed": {
          status = "completed";
          logger.routes.info("Stripe checkout completed", { customerId: stripeCustomerId });
          break;
        }
        case "invoice.paid": {
          invoiceId = obj.id;
          amountCents = obj.amount_paid;
          status = "paid";
          logger.routes.info("Stripe invoice paid", { invoiceId, customerId: stripeCustomerId, amountCents });
          break;
        }
        case "invoice.payment_failed": {
          invoiceId = obj.id;
          amountCents = obj.amount_due;
          status = "failed";
          logger.routes.warn("Stripe invoice payment failed", { invoiceId, customerId: stripeCustomerId });
          break;
        }
        default:
          status = obj.status || null;
          logger.routes.debug("Unhandled Stripe event", { type: event.type });
      }

      await db.insert(stripeEvents).values({
        stripeEventId: event.id,
        eventType: event.type,
        stripeCustomerId,
        userId: matchedUser,
        invoiceId,
        amountCents,
        status,
        payload: JSON.stringify(event.data.object),
      }).onConflictDoNothing();

      logger.routes.info("Stripe event logged", { eventId: event.id, type: event.type });

      res.json({ received: true });
    } catch (error: any) {
      logger.routes.error("Stripe webhook error", error);
      res.status(400).json({ message: "Webhook error" });
    }
  });

  return httpServer;
}
