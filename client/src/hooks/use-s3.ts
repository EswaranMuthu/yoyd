import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { S3Object, PresignedUrlResponse, SyncResponse } from "@shared/schema";

export function useS3Objects(prefix?: string) {
  const url = prefix ? `/api/objects?prefix=${encodeURIComponent(prefix)}` : "/api/objects";
  return useQuery<S3Object[]>({
    queryKey: [url],
  });
}

export function useSyncObjects() {
  return useMutation<SyncResponse>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/objects/sync");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/objects")
      });
    },
  });
}

export function useCreateFolder() {
  return useMutation<S3Object, Error, { name: string; parentKey?: string }>({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", "/api/objects/folder", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/objects")
      });
    },
  });
}

export function useGetUploadUrl() {
  return useMutation<PresignedUrlResponse, Error, { fileName: string; mimeType: string; parentKey?: string }>({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", "/api/objects/upload-url", data);
      return res.json();
    },
  });
}

export function useConfirmUpload() {
  return useMutation<S3Object, Error, { key: string }>({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", "/api/objects/confirm-upload", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/objects")
      });
    },
  });
}

export function useGetDownloadUrl() {
  return useMutation<{ url: string }, Error, number>({
    mutationFn: async (id) => {
      const res = await apiRequest("GET", `/api/objects/${id}/download`);
      return res.json();
    },
  });
}

export interface StorageStats {
  totalBytes: number;
  folderSizes: Record<string, number>;
}

export function useStorageStats(prefix?: string) {
  const url = prefix
    ? `/api/objects/storage-stats?prefix=${encodeURIComponent(prefix)}`
    : "/api/objects/storage-stats";
  return useQuery<StorageStats>({
    queryKey: [url],
  });
}

export function useDeleteObjects() {
  return useMutation<{ deleted: number }, Error, { keys: string[] }>({
    mutationFn: async (data) => {
      const res = await apiRequest("DELETE", "/api/objects", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/objects")
      });
    },
  });
}
