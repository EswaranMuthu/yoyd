import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useS3Objects, useSyncObjects, useCreateFolder, useGetUploadUrl, useConfirmUpload, useGetDownloadUrl, useDeleteObjects } from "@/hooks/use-s3";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  LogOut, 
  FolderPlus, 
  Upload, 
  Trash2, 
  RefreshCw, 
  Folder, 
  FileText, 
  FileImage, 
  FileVideo, 
  FileAudio,
  File,
  ChevronRight,
  Home,
  Download,
  HardDrive
} from "lucide-react";
import { format } from "date-fns";
import type { S3Object } from "@shared/schema";

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileIcon(object: S3Object) {
  if (object.isFolder) {
    return <Folder className="w-5 h-5 text-blue-500" />;
  }
  const mimeType = object.mimeType || "";
  if (mimeType.startsWith("image/")) {
    return <FileImage className="w-5 h-5 text-green-500" />;
  }
  if (mimeType.startsWith("video/")) {
    return <FileVideo className="w-5 h-5 text-purple-500" />;
  }
  if (mimeType.startsWith("audio/")) {
    return <FileAudio className="w-5 h-5 text-orange-500" />;
  }
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text")) {
    return <FileText className="w-5 h-5 text-red-500" />;
  }
  return <File className="w-5 h-5 text-muted-foreground" />;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  
  const [currentPath, setCurrentPath] = useState<string>("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [newFolderName, setNewFolderName] = useState("");
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const { data: objects, isLoading } = useS3Objects(currentPath);
  const syncMutation = useSyncObjects();
  const createFolderMutation = useCreateFolder();
  const getUploadUrlMutation = useGetUploadUrl();
  const confirmUploadMutation = useConfirmUpload();
  const getDownloadUrlMutation = useGetDownloadUrl();
  const deleteMutation = useDeleteObjects();

  const pathParts = currentPath.split("/").filter((p) => p);
  const breadcrumbs = pathParts.map((part, index) => ({
    name: part,
    path: pathParts.slice(0, index + 1).join("/") + "/",
  }));

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path);
    setSelectedKeys(new Set());
  }, []);

  const handleFolderClick = useCallback((object: S3Object) => {
    if (object.isFolder) {
      navigateTo(object.key);
    }
  }, [navigateTo]);

  const handleFileClick = useCallback(async (object: S3Object) => {
    if (!object.isFolder) {
      try {
        const result = await getDownloadUrlMutation.mutateAsync(object.id);
        window.open(result.url, "_blank");
      } catch {
        toast({
          variant: "destructive",
          title: "Download failed",
          description: "Failed to get download link",
        });
      }
    }
  }, [getDownloadUrlMutation, toast]);

  const handleSync = useCallback(async () => {
    try {
      const result = await syncMutation.mutateAsync();
      toast({
        title: "Sync complete",
        description: `Synced ${result.synced} objects, removed ${result.deleted} stale entries`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: "Failed to sync with S3",
      });
    }
  }, [syncMutation, toast]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolderMutation.mutateAsync({
        name: newFolderName.trim(),
        parentKey: currentPath || undefined,
      });
      setNewFolderName("");
      setIsNewFolderOpen(false);
      toast({
        title: "Folder created",
        description: `Created folder "${newFolderName}"`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to create folder",
        description: "An error occurred",
      });
    }
  }, [newFolderName, currentPath, createFolderMutation, toast]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { url, key } = await getUploadUrlMutation.mutateAsync({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          parentKey: currentPath || undefined,
        });

        await fetch(url, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });

        await confirmUploadMutation.mutateAsync({ key });
      }
      toast({
        title: "Upload complete",
        description: `Uploaded ${files.length} file(s)`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: "Failed to upload file(s)",
      });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }, [currentPath, getUploadUrlMutation, confirmUploadMutation, toast]);

  const handleDelete = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    try {
      const result = await deleteMutation.mutateAsync({ keys: Array.from(selectedKeys) });
      setSelectedKeys(new Set());
      setIsDeleteOpen(false);
      toast({
        title: "Deleted",
        description: `Deleted ${result.deleted} item(s)`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: "Failed to delete item(s)",
      });
    }
  }, [selectedKeys, deleteMutation, toast]);

  const toggleSelection = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!objects) return;
    if (selectedKeys.size === objects.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(objects.map((o) => o.key)));
    }
  }, [objects, selectedKeys]);

  return (
    <div className="min-h-screen bg-muted/20 flex">
      <aside className="w-64 bg-card border-r border-border hidden md:flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display shadow-lg shadow-primary/25">
              H
            </div>
            <span className="text-lg font-bold font-display tracking-tight">hexaprotal1</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <Button variant="secondary" className="w-full justify-start gap-3 bg-secondary/50 font-medium" data-testid="nav-storage">
            <HardDrive className="w-4 h-4" />
            Storage Browser
          </Button>
        </nav>

        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar className="w-8 h-8 border border-border">
              <AvatarImage src={user?.profileImageUrl} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate" data-testid="text-username">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-email">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={() => logout()} data-testid="button-logout">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      <main className="flex-1 md:ml-64 p-4 lg:p-8">
        <header className="flex flex-col gap-4 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold font-display text-foreground" data-testid="text-title">Storage Browser</h1>
              <p className="text-muted-foreground mt-1">Browse and manage your S3 storage</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSync} disabled={syncMutation.isPending} data-testid="button-sync">
                <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                Sync
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigateTo("")}
              className="h-8 px-2"
              data-testid="button-home"
            >
              <Home className="w-4 h-4" />
            </Button>
            {breadcrumbs.map((crumb, i) => (
              <div key={crumb.path} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateTo(crumb.path)}
                  className="h-8 px-2"
                  data-testid={`button-breadcrumb-${i}`}
                >
                  {crumb.name}
                </Button>
              </div>
            ))}
          </div>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Files & Folders</CardTitle>
                <CardDescription>
                  {objects?.length ?? 0} items in {currentPath || "root"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-new-folder">
                      <FolderPlus className="w-4 h-4 mr-2" />
                      New Folder
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Folder</DialogTitle>
                      <DialogDescription>
                        Enter a name for the new folder
                      </DialogDescription>
                    </DialogHeader>
                    <Input
                      placeholder="Folder name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                      data-testid="input-folder-name"
                    />
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsNewFolderOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleCreateFolder} 
                        disabled={!newFolderName.trim() || createFolderMutation.isPending}
                        data-testid="button-create-folder"
                      >
                        {createFolderMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Create
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Button variant="outline" size="sm" disabled={isUploading} asChild data-testid="button-upload">
                  <label className="cursor-pointer">
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    Upload
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                  </label>
                </Button>

                {selectedKeys.size > 0 && (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => setIsDeleteOpen(true)}
                    data-testid="button-delete"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete ({selectedKeys.size})
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : objects?.length === 0 ? (
              <div className="text-center py-12">
                <Folder className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium text-foreground">No files or folders</h3>
                <p className="text-muted-foreground mb-4">
                  This location is empty. Upload files or create a folder to get started.
                </p>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" onClick={() => setIsNewFolderOpen(true)}>
                    <FolderPlus className="w-4 h-4 mr-2" />
                    New Folder
                  </Button>
                  <Button asChild>
                    <label className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Files
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  </Button>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={objects && selectedKeys.size === objects.length && objects.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden md:table-cell">Size</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Modified</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {objects?.map((object) => (
                    <TableRow 
                      key={object.key} 
                      className="cursor-pointer hover-elevate"
                      data-testid={`row-object-${object.id}`}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedKeys.has(object.key)}
                          onCheckedChange={() => toggleSelection(object.key)}
                          data-testid={`checkbox-object-${object.id}`}
                        />
                      </TableCell>
                      <TableCell 
                        onClick={() => object.isFolder ? handleFolderClick(object) : handleFileClick(object)}
                      >
                        <div className="flex items-center gap-3">
                          {getFileIcon(object)}
                          <span className="font-medium" data-testid={`text-name-${object.id}`}>{object.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {object.isFolder ? (
                          <Badge variant="secondary">Folder</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">{object.mimeType || "Unknown"}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {object.isFolder ? "-" : formatFileSize(object.size)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {object.lastModified 
                          ? format(new Date(object.lastModified), "MMM d, yyyy HH:mm")
                          : "-"
                        }
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {!object.isFolder && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleFileClick(object)}
                            data-testid={`button-download-${object.id}`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedKeys.size} item(s)?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the selected files and folders from your storage.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
