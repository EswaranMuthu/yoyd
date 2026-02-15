export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function generateBreadcrumbs(currentPath: string) {
  const pathParts = currentPath.split("/").filter((p) => p);
  return pathParts.map((part, index) => ({
    name: part,
    path: pathParts.slice(0, index + 1).join("/") + "/",
  }));
}
