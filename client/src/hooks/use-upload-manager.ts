import { useState, useCallback, useRef, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { fetchWithAuth, getAccessToken, isTokenExpiringSoon, refreshAccessToken } from "@/lib/auth";

export const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
export const PART_SIZE = 10 * 1024 * 1024;
export const MAX_CONCURRENT_PARTS = 3;

export type UploadStatus = "queued" | "uploading" | "completed" | "failed" | "cancelled";

export interface UploadItem {
  id: string;
  file: File;
  relativePath?: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  uploadId?: string;
  key?: string;
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useUploadManager() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const processingRef = useRef(false);

  const updateUpload = useCallback((id: string, updates: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...updates } : u)));
  }, []);

  const uploadSmallFile = useCallback(
    async (item: UploadItem, parentKey: string) => {
      const controller = new AbortController();
      abortControllersRef.current.set(item.id, controller);

      if (isTokenExpiringSoon()) {
        await refreshAccessToken();
      }

      const formData = new FormData();
      formData.append("file", item.file);
      if (parentKey) {
        formData.append("parentKey", parentKey);
      }

      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/objects/upload");
        xhr.timeout = 120000;

        const token = getAccessToken();
        if (token) {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            updateUpload(item.id, { progress: pct });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else if (xhr.status === 401) {
            reject(new Error("Session expired. Please log in again."));
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.message || "Upload failed"));
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.onabort = () => reject(new Error("Cancelled"));
        xhr.ontimeout = () => reject(new Error("Upload timed out"));

        controller.signal.addEventListener("abort", () => xhr.abort());

        xhr.send(formData);
      });
    },
    [updateUpload]
  );

  const uploadLargeFile = useCallback(
    async (item: UploadItem, parentKey: string) => {
      const controller = new AbortController();
      abortControllersRef.current.set(item.id, controller);

      const fileName = item.relativePath || item.file.name;
      const res = await apiRequest("POST", "/api/objects/multipart/initiate", {
        fileName,
        mimeType: item.file.type || "application/octet-stream",
        parentKey: parentKey || undefined,
      });
      const { uploadId, key } = await res.json();
      updateUpload(item.id, { uploadId, key });

      const totalParts = Math.ceil(item.file.size / PART_SIZE);
      const completedParts: { PartNumber: number; ETag: string }[] = [];
      let uploadedBytes = 0;

      const uploadPart = async (partNumber: number): Promise<void> => {
        if (controller.signal.aborted) throw new Error("Cancelled");

        const start = (partNumber - 1) * PART_SIZE;
        const end = Math.min(start + PART_SIZE, item.file.size);
        const blob = item.file.slice(start, end);

        const presignRes = await apiRequest("POST", "/api/objects/multipart/presign-part", {
          key,
          uploadId,
          partNumber,
        });
        const { url } = await presignRes.json();

        const partRes = await fetch(url, {
          method: "PUT",
          body: blob,
          signal: controller.signal,
        });

        if (!partRes.ok) throw new Error(`Failed to upload part ${partNumber}`);

        const etag = partRes.headers.get("ETag");
        if (!etag) throw new Error(`No ETag returned for part ${partNumber}`);

        completedParts.push({ PartNumber: partNumber, ETag: etag.replace(/"/g, "") });
        uploadedBytes += end - start;
        updateUpload(item.id, { progress: Math.round((uploadedBytes / item.file.size) * 100) });
      };

      const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
      for (let i = 0; i < partNumbers.length; i += MAX_CONCURRENT_PARTS) {
        if (controller.signal.aborted) throw new Error("Cancelled");
        const batch = partNumbers.slice(i, i + MAX_CONCURRENT_PARTS);
        await Promise.all(batch.map(uploadPart));
      }

      const sortedParts = completedParts.sort((a, b) => a.PartNumber - b.PartNumber);
      await apiRequest("POST", "/api/objects/multipart/complete", {
        key,
        uploadId,
        parts: sortedParts,
      });
    },
    [updateUpload]
  );

  const processQueue = useCallback(async (currentPath: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

    try {
      while (true) {
        let nextItem: UploadItem | undefined;
        setUploads((prev) => {
          nextItem = prev.find((u) => u.status === "queued");
          if (nextItem) {
            return prev.map((u) =>
              u.id === nextItem!.id ? { ...u, status: "uploading" as UploadStatus } : u
            );
          }
          return prev;
        });

        await new Promise((r) => setTimeout(r, 0));

        if (!nextItem) break;
        const itemToProcess = nextItem;

        const parentKey = itemToProcess.relativePath
          ? (() => {
              const parts = itemToProcess.relativePath.split("/");
              if (parts.length > 1) {
                const folderPath = parts.slice(0, -1).join("/") + "/";
                return currentPath ? currentPath + folderPath : folderPath;
              }
              return currentPath;
            })()
          : currentPath;

        try {
          console.log("[upload] Starting upload:", itemToProcess.file.name, "parentKey:", parentKey, "size:", itemToProcess.file.size);
          if (itemToProcess.file.size > MULTIPART_THRESHOLD) {
            await uploadLargeFile(itemToProcess, parentKey);
          } else {
            await uploadSmallFile(itemToProcess, parentKey);
          }
          console.log("[upload] Completed:", itemToProcess.file.name);
          updateUpload(itemToProcess.id, { status: "completed", progress: 100 });
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Upload failed";
          console.error("[upload] Failed:", itemToProcess.file.name, msg);

          let currentItem: UploadItem | undefined;
          setUploads((prev) => {
            currentItem = prev.find((u) => u.id === itemToProcess.id);
            return prev;
          });
          if (currentItem?.uploadId && currentItem?.key) {
            try {
              await apiRequest("POST", "/api/objects/multipart/abort", {
                key: currentItem.key,
                uploadId: currentItem.uploadId,
              });
            } catch {
            }
          }

          if (msg === "Cancelled") {
            updateUpload(itemToProcess.id, { status: "cancelled", error: msg });
          } else {
            updateUpload(itemToProcess.id, { status: "failed", error: msg });
          }
        }
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/objects"),
      });
    }
  }, [uploadSmallFile, uploadLargeFile, updateUpload]);

  const addFiles = useCallback(
    (files: File[], currentPath: string, relativePaths?: Map<File, string>) => {
      const filtered = files.filter((file) => {
        const name = file.name;
        return name && !name.startsWith(".");
      });

      const newItems: UploadItem[] = filtered.map((file) => ({
        id: generateId(),
        file,
        relativePath: relativePaths?.get(file),
        status: "queued" as UploadStatus,
        progress: 0,
      }));

      setUploads((prev) => [...prev, ...newItems]);

      setTimeout(() => processQueue(currentPath), 0);
    },
    [processQueue]
  );

  const cancelUpload = useCallback(
    (id: string) => {
      const controller = abortControllersRef.current.get(id);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(id);
      }
      setUploads((prev) =>
        prev.map((u) =>
          u.id === id && (u.status === "queued" || u.status === "uploading")
            ? { ...u, status: "cancelled" as UploadStatus }
            : u
        )
      );
    },
    []
  );

  const retryUpload = useCallback(
    (id: string, currentPath: string) => {
      setUploads((prev) =>
        prev.map((u) =>
          u.id === id && (u.status === "failed" || u.status === "cancelled")
            ? { ...u, status: "queued" as UploadStatus, progress: 0, error: undefined }
            : u
        )
      );
      setTimeout(() => processQueue(currentPath), 0);
    },
    [processQueue]
  );

  const clearCompleted = useCallback(() => {
    setUploads((prev) =>
      prev.filter((u) => u.status !== "completed" && u.status !== "cancelled" && u.status !== "failed")
    );
  }, []);

  const overallProgress = uploads.length > 0
    ? Math.round(uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length)
    : 0;

  const activeCount = uploads.filter((u) => u.status === "uploading" || u.status === "queued").length;
  const completedCount = uploads.filter((u) => u.status === "completed").length;
  const failedCount = uploads.filter((u) => u.status === "failed").length;

  const folderGroups = useMemo(() => {
    const groups = new Map<string, UploadItem[]>();
    const standalone: UploadItem[] = [];
    for (const item of uploads) {
      if (item.relativePath && item.relativePath.includes("/")) {
        const topFolder = item.relativePath.split("/")[0];
        if (!groups.has(topFolder)) groups.set(topFolder, []);
        groups.get(topFolder)!.push(item);
      } else {
        standalone.push(item);
      }
    }
    return { folders: groups, standalone };
  }, [uploads]);

  return {
    uploads,
    isProcessing,
    addFiles,
    cancelUpload,
    retryUpload,
    clearCompleted,
    overallProgress,
    activeCount,
    completedCount,
    failedCount,
    folderGroups,
  };
}
