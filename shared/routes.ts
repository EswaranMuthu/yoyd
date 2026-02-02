import { z } from 'zod';
import { insertS3ObjectSchema, s3Objects } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  objects: {
    list: {
      method: 'GET' as const,
      path: '/api/objects',
      responses: {
        200: z.array(z.custom<typeof s3Objects.$inferSelect>()),
        401: errorSchemas.unauthorized,
      },
    },
    sync: {
      method: 'POST' as const,
      path: '/api/objects/sync',
      responses: {
        200: z.object({ synced: z.number(), deleted: z.number() }),
        401: errorSchemas.unauthorized,
        500: errorSchemas.internal,
      },
    },
    createFolder: {
      method: 'POST' as const,
      path: '/api/objects/folder',
      input: z.object({ name: z.string().min(1), parentKey: z.string().optional() }),
      responses: {
        201: z.custom<typeof s3Objects.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    uploadUrl: {
      method: 'POST' as const,
      path: '/api/objects/upload-url',
      input: z.object({ fileName: z.string().min(1), mimeType: z.string(), parentKey: z.string().optional() }),
      responses: {
        200: z.object({ url: z.string(), key: z.string() }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    confirmUpload: {
      method: 'POST' as const,
      path: '/api/objects/confirm-upload',
      input: z.object({ key: z.string() }),
      responses: {
        200: z.custom<typeof s3Objects.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    downloadUrl: {
      method: 'GET' as const,
      path: '/api/objects/:id/download',
      responses: {
        200: z.object({ url: z.string() }),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/objects',
      input: z.object({ keys: z.array(z.string()).min(1) }),
      responses: {
        200: z.object({ deleted: z.number() }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
