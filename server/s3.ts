import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSecrets } from "./vault";
import { logger } from "./logger";

let s3Client: S3Client | null = null;
let bucketName: string = "";
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  logger.s3.info("Initializing S3 client from vault secrets");
  const secrets = await getSecrets([
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_S3_BUCKET",
  ]);
  const region = secrets.AWS_REGION || "us-east-1";
  s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId: secrets.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY || "",
    },
  });
  bucketName = secrets.AWS_S3_BUCKET || "";
  initialized = true;
  logger.s3.info("S3 client initialized", { region, bucket: bucketName });
}

function getClient(): S3Client {
  if (!s3Client) throw new Error("S3 not initialized - call ensureInitialized first");
  return s3Client;
}

export interface S3ListResult {
  key: string;
  name: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
  isFolder: boolean;
}

export async function listS3Objects(prefix: string = ""): Promise<S3ListResult[]> {
  await ensureInitialized();
  logger.s3.debug("Listing objects", { prefix, delimiter: "/" });
  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
    Delimiter: "/",
  });

  const response = await getClient().send(command);
  const objects: S3ListResult[] = [];

  if (response.CommonPrefixes) {
    for (const prefix of response.CommonPrefixes) {
      if (prefix.Prefix) {
        const name = prefix.Prefix.replace(/\/$/, "").split("/").pop() || "";
        objects.push({
          key: prefix.Prefix,
          name,
          isFolder: true,
        });
      }
    }
  }

  if (response.Contents) {
    for (const obj of response.Contents) {
      if (obj.Key && obj.Key !== prefix) {
        const name = obj.Key.split("/").pop() || "";
        if (name) {
          objects.push({
            key: obj.Key,
            name,
            size: obj.Size,
            lastModified: obj.LastModified,
            etag: obj.ETag?.replace(/"/g, ""),
            isFolder: false,
          });
        }
      }
    }
  }

  logger.s3.debug("List objects result", { prefix, folders: objects.filter(o => o.isFolder).length, files: objects.filter(o => !o.isFolder).length });
  return objects;
}

export async function createFolder(folderKey: string): Promise<void> {
  await ensureInitialized();
  const key = folderKey.endsWith("/") ? folderKey : `${folderKey}/`;
  logger.s3.debug("Creating folder", { key });
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: "",
  });
  await getClient().send(command);
  logger.s3.info("Folder created", { key });
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  await ensureInitialized();
  logger.s3.debug("Generating presigned upload URL", { key, contentType });
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });
  return await getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<void> {
  await ensureInitialized();
  logger.s3.info("Uploading file to S3", { key, contentType, size_bytes: body.length });
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await getClient().send(command);
  logger.s3.info("File uploaded successfully", { key, size_bytes: body.length });
}

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  await ensureInitialized();
  logger.s3.debug("Generating presigned download URL", { key });
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  return await getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

export async function deleteS3Object(key: string): Promise<void> {
  await ensureInitialized();
  logger.s3.info("Deleting S3 object", { key });
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  await getClient().send(command);
  logger.s3.info("S3 object deleted", { key });
}

export async function deleteS3Objects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await ensureInitialized();
  logger.s3.info("Batch deleting S3 objects", { count: keys.length });

  const command = new DeleteObjectsCommand({
    Bucket: bucketName,
    Delete: {
      Objects: keys.map((key) => ({ Key: key })),
    },
  });
  await getClient().send(command);
  logger.s3.info("Batch delete completed", { count: keys.length });
}

export async function getObjectMetadata(key: string): Promise<{
  size?: number;
  mimeType?: string;
  lastModified?: Date;
  etag?: string;
} | null> {
  try {
    await ensureInitialized();
    logger.s3.debug("Fetching object metadata", { key });
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const response = await getClient().send(command);
    logger.s3.debug("Object metadata retrieved", { key, size: response.ContentLength, contentType: response.ContentType });
    return {
      size: response.ContentLength,
      mimeType: response.ContentType,
      lastModified: response.LastModified,
      etag: response.ETag?.replace(/"/g, ""),
    };
  } catch (err) {
    logger.s3.warn("Object metadata not found", { key });
    return null;
  }
}

export async function listAllS3Objects(prefix: string = ""): Promise<S3ListResult[]> {
  await ensureInitialized();
  logger.s3.debug("Listing all objects (recursive)", { prefix });
  const allObjects: S3ListResult[] = [];
  let continuationToken: string | undefined;
  let pageCount = 0;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const response = await getClient().send(command);
    pageCount++;

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          const name = obj.Key.split("/").pop() || "";
          const isFolder = obj.Key.endsWith("/");
          allObjects.push({
            key: obj.Key,
            name: isFolder ? obj.Key.replace(/\/$/, "").split("/").pop() || "" : name,
            size: obj.Size,
            lastModified: obj.LastModified,
            etag: obj.ETag?.replace(/"/g, ""),
            isFolder,
          });
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  logger.s3.debug("List all objects completed", { prefix, total: allObjects.length, pages: pageCount });
  return allObjects;
}

export function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    ts: "application/typescript",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

export async function initiateMultipartUpload(key: string, contentType: string): Promise<string> {
  await ensureInitialized();
  logger.s3.info("Initiating multipart upload", { key, contentType });
  const command = new CreateMultipartUploadCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });
  const response = await getClient().send(command);
  if (!response.UploadId) throw new Error("Failed to initiate multipart upload");
  logger.s3.info("Multipart upload initiated", { key, uploadId: response.UploadId });
  return response.UploadId;
}

export async function getPresignedPartUrl(key: string, uploadId: string, partNumber: number): Promise<string> {
  await ensureInitialized();
  logger.s3.debug("Generating presigned part URL", { key, uploadId, partNumber });
  const command = new UploadPartCommand({
    Bucket: bucketName,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return await getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[]
): Promise<void> {
  await ensureInitialized();
  logger.s3.info("Completing multipart upload", { key, uploadId, totalParts: parts.length });
  const command = new CompleteMultipartUploadCommand({
    Bucket: bucketName,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
    },
  });
  await getClient().send(command);
  logger.s3.info("Multipart upload completed", { key, uploadId, totalParts: parts.length });
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await ensureInitialized();
  logger.s3.warn("Aborting multipart upload", { key, uploadId });
  const command = new AbortMultipartUploadCommand({
    Bucket: bucketName,
    Key: key,
    UploadId: uploadId,
  });
  await getClient().send(command);
  logger.s3.warn("Multipart upload aborted", { key, uploadId });
}

export function resetS3Client(): void {
  s3Client = null;
  bucketName = "";
  initialized = false;
}

export { s3Client, bucketName };
