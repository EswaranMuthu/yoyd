import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSecrets } from "./vault";

let s3Client: S3Client | null = null;
let bucketName: string = "";
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  const secrets = await getSecrets([
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_S3_BUCKET",
  ]);
  s3Client = new S3Client({
    region: secrets.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: secrets.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY || "",
    },
  });
  bucketName = secrets.AWS_S3_BUCKET || "";
  initialized = true;
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

  return objects;
}

export async function createFolder(folderKey: string): Promise<void> {
  await ensureInitialized();
  const key = folderKey.endsWith("/") ? folderKey : `${folderKey}/`;
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: "",
  });
  await getClient().send(command);
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  await ensureInitialized();
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });
  return await getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<void> {
  await ensureInitialized();
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await getClient().send(command);
}

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  await ensureInitialized();
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  return await getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

export async function deleteS3Object(key: string): Promise<void> {
  await ensureInitialized();
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  await getClient().send(command);
}

export async function deleteS3Objects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await ensureInitialized();

  const command = new DeleteObjectsCommand({
    Bucket: bucketName,
    Delete: {
      Objects: keys.map((key) => ({ Key: key })),
    },
  });
  await getClient().send(command);
}

export async function getObjectMetadata(key: string): Promise<{
  size?: number;
  mimeType?: string;
  lastModified?: Date;
  etag?: string;
} | null> {
  try {
    await ensureInitialized();
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const response = await getClient().send(command);
    return {
      size: response.ContentLength,
      mimeType: response.ContentType,
      lastModified: response.LastModified,
      etag: response.ETag?.replace(/"/g, ""),
    };
  } catch {
    return null;
  }
}

export async function listAllS3Objects(prefix: string = ""): Promise<S3ListResult[]> {
  await ensureInitialized();
  const allObjects: S3ListResult[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const response = await getClient().send(command);

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

export function resetS3Client(): void {
  s3Client = null;
  bucketName = "";
  initialized = false;
}

export { s3Client, bucketName };
