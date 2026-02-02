import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
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
import type { InsertS3Object } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  await setupAuth(app);
  registerAuthRoutes(app);

  app.get(api.objects.list.path, isAuthenticated, async (req, res) => {
    try {
      const prefix = (req.query.prefix as string) || "";
      const objects = await storage.getObjects(prefix || null);
      res.json(objects);
    } catch (error) {
      console.error("Error listing objects:", error);
      res.status(500).json({ message: "Failed to list objects" });
    }
  });

  app.post(api.objects.sync.path, isAuthenticated, async (req, res) => {
    try {
      const s3Objects = await listAllS3Objects();
      const dbObjects = await storage.getAllObjects();
      const dbKeySet = new Set(dbObjects.map((o) => o.key));
      const s3KeySet = new Set(s3Objects.map((o) => o.key));

      let synced = 0;
      let deleted = 0;

      for (const s3Obj of s3Objects) {
        const parts = s3Obj.key.split("/").filter((p) => p);
        const name = s3Obj.isFolder 
          ? parts[parts.length - 1] || s3Obj.key 
          : parts[parts.length - 1] || s3Obj.key;
        
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
        if (!s3KeySet.has(dbObj.key)) {
          await storage.deleteObject(dbObj.key);
          deleted++;
        }
      }

      res.json({ synced, deleted });
    } catch (error) {
      console.error("Error syncing objects:", error);
      res.status(500).json({ message: "Failed to sync objects" });
    }
  });

  app.post(api.objects.createFolder.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.objects.createFolder.input.parse(req.body);
      const folderKey = input.parentKey 
        ? `${input.parentKey}${input.name}/`
        : `${input.name}/`;

      await createS3Folder(folderKey);

      const parts = folderKey.split("/").filter((p) => p);
      let parentKey: string | null = null;
      if (parts.length > 1) {
        parentKey = parts.slice(0, -1).join("/") + "/";
      }

      const insertObj: InsertS3Object = {
        key: folderKey,
        name: input.name,
        parentKey,
        isFolder: true,
        size: null,
        mimeType: null,
        etag: null,
        lastModified: new Date(),
      };

      const folder = await storage.createObject(insertObj);
      res.status(201).json(folder);
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
      const input = api.objects.uploadUrl.input.parse(req.body);
      const key = input.parentKey
        ? `${input.parentKey}${input.fileName}`
        : input.fileName;

      const url = await getPresignedUploadUrl(key, input.mimeType);
      res.json({ url, key });
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
      const input = api.objects.confirmUpload.input.parse(req.body);
      const metadata = await getObjectMetadata(input.key);

      if (!metadata) {
        return res.status(400).json({ message: "Object not found in S3" });
      }

      const parts = input.key.split("/").filter((p) => p);
      const name = parts[parts.length - 1] || input.key;
      let parentKey: string | null = null;
      if (parts.length > 1) {
        parentKey = parts.slice(0, -1).join("/") + "/";
      }

      const insertObj: InsertS3Object = {
        key: input.key,
        name,
        parentKey,
        isFolder: false,
        size: metadata.size ?? null,
        mimeType: metadata.mimeType ?? getMimeType(name),
        etag: metadata.etag ?? null,
        lastModified: metadata.lastModified ?? new Date(),
      };

      const object = await storage.upsertObject(insertObj);
      res.json(object);
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
      const id = Number(req.params.id);
      const object = await storage.getObject(id);

      if (!object) {
        return res.status(404).json({ message: "Object not found" });
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
      const input = api.objects.delete.input.parse(req.body);
      
      const allKeysToDelete: string[] = [];
      
      for (const key of input.keys) {
        allKeysToDelete.push(key);
        if (key.endsWith("/")) {
          const s3Objects = await listAllS3Objects(key);
          for (const obj of s3Objects) {
            allKeysToDelete.push(obj.key);
          }
        }
      }

      const uniqueKeys = [...new Set(allKeysToDelete)];

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
