import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { registerAuthRoutes } from "./auth/routes";
import { isAuthenticated } from "./auth/middleware";
import { z } from "zod";
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
} from "./s3";
import type { InsertS3Object, S3Object } from "@shared/schema";

function getUserPrefix(username: string): string {
  return `users/${username}/`;
}

function addUserPrefix(key: string, username: string): string {
  const prefix = getUserPrefix(username);
  if (key.startsWith(prefix)) return key;
  return `${prefix}${key}`;
}

function stripUserPrefix(key: string, username: string): string {
  const prefix = getUserPrefix(username);
  if (key.startsWith(prefix)) {
    return key.slice(prefix.length);
  }
  return key;
}

function stripPrefixFromObject(obj: S3Object, username: string): S3Object {
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

      const objects = await storage.getObjectsByPrefix(fullPrefix);
      const stripped = objects.map((obj) => stripPrefixFromObject(obj, username));
      res.json(stripped);
    } catch (error) {
      console.error("Error listing objects:", error);
      res.status(500).json({ message: "Failed to list objects" });
    }
  });

  app.post(api.objects.sync.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const userPrefix = getUserPrefix(username);

      try {
        await createS3Folder(userPrefix);
      } catch (folderErr) {
        console.error("Error creating user folder in S3:", folderErr);
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

      res.json({ synced, deleted });
    } catch (error: any) {
      console.error("Error syncing objects:", error);
      const detail = error?.message || "Unknown error";
      res.status(500).json({ message: `Failed to sync objects: ${detail}` });
    }
  });

  app.post(api.objects.createFolder.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const input = api.objects.createFolder.input.parse(req.body);

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
      res.status(201).json(stripPrefixFromObject(folder, username));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      console.error("Error creating folder:", error);
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  app.post(api.objects.uploadUrl.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const input = api.objects.uploadUrl.input.parse(req.body);

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
      console.error("Error generating upload URL:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  app.post(api.objects.confirmUpload.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const input = api.objects.confirmUpload.input.parse(req.body);
      const fullKey = addUserPrefix(input.key, username);

      const metadata = await getObjectMetadata(fullKey);

      if (!metadata) {
        return res.status(400).json({ message: "Object not found in S3" });
      }

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
      res.json(stripPrefixFromObject(object, username));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      console.error("Error confirming upload:", error);
      res.status(500).json({ message: "Failed to confirm upload" });
    }
  });

  app.get(api.objects.downloadUrl.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const userPrefix = getUserPrefix(username);
      const id = Number(req.params.id);
      const object = await storage.getObject(id);

      if (!object) {
        return res.status(404).json({ message: "Object not found" });
      }

      if (!object.key.startsWith(userPrefix)) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (object.isFolder) {
        return res.status(400).json({ message: "Cannot download a folder" });
      }

      const url = await getPresignedDownloadUrl(object.key);
      res.json({ url });
    } catch (error) {
      console.error("Error generating download URL:", error);
      res.status(500).json({ message: "Failed to generate download URL" });
    }
  });

  app.delete(api.objects.delete.path, isAuthenticated, async (req, res) => {
    try {
      const username = req.authUser!.username;
      const userPrefix = getUserPrefix(username);
      const input = api.objects.delete.input.parse(req.body);
      
      const allKeysToDelete: string[] = [];
      
      for (const clientKey of input.keys) {
        const fullKey = addUserPrefix(clientKey, username);

        if (!fullKey.startsWith(userPrefix)) {
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

      res.json({ deleted: uniqueKeys.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      console.error("Error deleting objects:", error);
      res.status(500).json({ message: "Failed to delete objects" });
    }
  });

  return httpServer;
}
