import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useS3Objects, useSyncObjects, useCreateFolder, useGetDownloadUrl, useDeleteObjects, useStorageStats } from "@/hooks/use-s3";
import { fetchWithAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatFileSize, generateBreadcrumbs } from "@/lib/file-utils";
import { useUploadManager, type UploadItem } from "@/hooks/use-upload-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
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
  HardDrive,
  X,
  Eye,
  ChevronLeft,
  FolderUp,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Ban,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import type { S3Object } from "@shared/schema";

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
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string; size: number | null; objectId: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
  const [isUploadPanelVisible, setIsUploadPanelVisible] = useState(true);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { data: objects, isLoading } = useS3Objects(currentPath);
  const { data: storageStats } = useStorageStats(currentPath);
  const syncMutation = useSyncObjects();
  const createFolderMutation = useCreateFolder();
  const getDownloadUrlMutation = useGetDownloadUrl();
  const deleteMutation = useDeleteObjects();
  const uploadManager = useUploadManager();

  const { data: paymentStatus } = useQuery<{
    hasCard: boolean;
    exceededFreeTier: boolean;
    monthlyConsumedBytes: number;
    needsPaymentMethod: boolean;
  } | null>({
    queryKey: ["/api/stripe/payment-status"],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const res = await fetchWithAuth("/api/stripe/payment-status");
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
  });

  const [billingLoading, setBillingLoading] = useState(false);
  const handleAddPaymentMethod = useCallback(async () => {
    setBillingLoading(true);
    try {
      const res = await apiRequest("POST", "/api/stripe/checkout-session");
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      toast({
        variant: "destructive",
        title: "Payment setup failed",
        description: "Could not open the payment setup page. Please try again.",
      });
      setBillingLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "success") {
      toast({
        title: "Payment method added",
        description: "Your card has been saved. You're all set!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/payment-status"] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (payment === "cancelled") {
      toast({
        variant: "destructive",
        title: "Payment setup cancelled",
        description: "You can add a payment method anytime from the dashboard.",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const breadcrumbs = generateBreadcrumbs(currentPath);

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path);
    setSelectedKeys(new Set());
  }, []);

  const handleFolderClick = useCallback((object: S3Object) => {
    if (object.isFolder) {
      navigateTo(object.key);
    }
  }, [navigateTo]);

  const isImageFile = useCallback((object: S3Object) => {
    const mimeType = object.mimeType || "";
    return mimeType.startsWith("image/");
  }, []);

  const imageObjects = useMemo(() => {
    return (objects || []).filter((o) => !o.isFolder && isImageFile(o));
  }, [objects, isImageFile]);

  const currentImageIndex = useMemo(() => {
    if (!previewImage) return -1;
    return imageObjects.findIndex((o) => o.id === previewImage.objectId);
  }, [imageObjects, previewImage]);

  const openPreviewForObject = useCallback(async (object: S3Object) => {
    setPreviewLoading(true);
    try {
      const result = await getDownloadUrlMutation.mutateAsync(object.id);
      setPreviewImage({ url: result.url, name: object.name, size: object.size, objectId: object.id });
    } catch {
      toast({
        variant: "destructive",
        title: "Preview failed",
        description: "Failed to load image preview",
      });
    } finally {
      setPreviewLoading(false);
    }
  }, [getDownloadUrlMutation, toast]);

  const handleFileClick = useCallback(async (object: S3Object) => {
    if (object.isFolder) return;

    if (isImageFile(object)) {
      await openPreviewForObject(object);
    } else {
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
  }, [getDownloadUrlMutation, toast, isImageFile, openPreviewForObject]);

  const handlePrevImage = useCallback(async () => {
    if (currentImageIndex > 0) {
      await openPreviewForObject(imageObjects[currentImageIndex - 1]);
    }
  }, [currentImageIndex, imageObjects, openPreviewForObject]);

  const handleNextImage = useCallback(async () => {
    if (currentImageIndex < imageObjects.length - 1) {
      await openPreviewForObject(imageObjects[currentImageIndex + 1]);
    }
  }, [currentImageIndex, imageObjects, openPreviewForObject]);

  useEffect(() => {
    if (!previewImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevImage();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextImage();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage, handlePrevImage, handleNextImage]);

  const cancelledCount = useMemo(
    () => uploadManager.uploads.filter((u) => u.status === "cancelled").length,
    [uploadManager.uploads]
  );

  useEffect(() => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    const hasAnyFailure = uploadManager.uploads.some(
      (u) => u.status === "failed" || u.status === "cancelled"
    );
    const allSucceeded =
      uploadManager.uploads.length > 0 &&
      !uploadManager.isProcessing &&
      !hasAnyFailure &&
      uploadManager.uploads.every((u) => u.status === "completed");
    if (allSucceeded) {
      autoDismissTimerRef.current = setTimeout(() => {
        uploadManager.clearCompleted();
      }, 3000);
    }
    return () => {
      if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
    };
  }, [uploadManager.uploads.length, uploadManager.isProcessing, uploadManager.failedCount, cancelledCount, uploadManager.completedCount, uploadManager.clearCompleted, uploadManager.uploads]);

  const handleDownloadFromPreview = useCallback(() => {
    if (previewImage) {
      window.open(previewImage.url, "_blank");
    }
  }, [previewImage]);

  const handleSync = useCallback(async () => {
    try {
      const result = await syncMutation.mutateAsync();
      toast({
        title: "Sync complete",
        description: `Synced ${result.synced} objects, removed ${result.deleted} stale entries`,
      });
    } catch (error: any) {
      const msg = error?.message || "Failed to sync with S3";
      console.error("Sync error:", msg);
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: msg,
      });
    }
  }, [syncMutation, toast]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    const folderNameToCreate = newFolderName.trim();
    try {
      await createFolderMutation.mutateAsync({
        name: folderNameToCreate,
        parentKey: currentPath || undefined,
      });
      toast({
        title: "Folder created",
        description: `Created folder "${folderNameToCreate}"`,
      });
      setNewFolderName("");
      setIsNewFolderOpen(false);
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to create folder",
        description: "An error occurred",
      });
    }
  }, [newFolderName, currentPath, createFolderMutation, toast]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    uploadManager.addFiles(Array.from(files), currentPath);
    setIsUploadPanelOpen(true);
    setIsUploadPanelVisible(true);
    e.target.value = "";
  }, [currentPath, uploadManager]);

  const handleFolderUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const relativePaths = new Map<File, string>();
    for (const file of fileArray) {
      const relPath = (file as any).webkitRelativePath as string;
      if (relPath) {
        relativePaths.set(file, relPath);
      }
    }
    uploadManager.addFiles(fileArray, currentPath, relativePaths);
    setIsUploadPanelOpen(true);
    setIsUploadPanelVisible(true);
    e.target.value = "";
  }, [currentPath, uploadManager]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const traverseFileTree = useCallback((entry: any, path: string = ""): Promise<{ file: File; relativePath: string }[]> => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file: File) => {
          resolve([{ file, relativePath: path + file.name }]);
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        dirReader.readEntries(async (entries: any[]) => {
          const results: { file: File; relativePath: string }[] = [];
          for (const childEntry of entries) {
            const childResults = await traverseFileTree(childEntry, path + entry.name + "/");
            results.push(...childResults);
          }
          resolve(results);
        });
      } else {
        resolve([]);
      }
    });
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    const allFiles: File[] = [];
    const relativePaths = new Map<File, string>();

    const entries: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) {
        entries.push(entry);
      }
    }

    if (entries.length > 0) {
      for (const entry of entries) {
        const results = await traverseFileTree(entry);
        for (const { file, relativePath } of results) {
          allFiles.push(file);
          if (relativePath.includes("/")) {
            relativePaths.set(file, relativePath);
          }
        }
      }
    } else {
      const files = e.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        allFiles.push(files[i]);
      }
    }

    if (allFiles.length > 0) {
      uploadManager.addFiles(allFiles, currentPath, relativePaths.size > 0 ? relativePaths : undefined);
      setIsUploadPanelOpen(true);
      setIsUploadPanelVisible(true);
    }
  }, [currentPath, uploadManager, traverseFileTree]);

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
            <img src="/favicon.png" alt="goyoyd" className="w-8 h-8 rounded-lg shadow-lg shadow-primary/25" />
            <span className="text-lg font-bold font-display tracking-tight">goyoyd</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <Button variant="secondary" className="w-full justify-start gap-3 bg-secondary/50 font-medium" data-testid="nav-storage">
            <HardDrive className="w-4 h-4" />
            Storage Browser
          </Button>
        </nav>

        <div className="px-4 py-3 border-t border-border/50" data-testid="billing-sidebar">
          {paymentStatus?.hasCard ? (
            <div className="flex items-center gap-3 px-2 py-1">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Card on file</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(paymentStatus.monthlyConsumedBytes ?? 0)} used this month
                </p>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={handleAddPaymentMethod}
              disabled={billingLoading}
              data-testid="button-sidebar-add-payment"
            >
              {billingLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              Add Payment Method
            </Button>
          )}
        </div>

        {storageStats && (
          <div className="px-4 py-3 border-t border-border/50" data-testid="storage-usage">
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 shrink-0">
                <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
                  <circle
                    cx="22" cy="22" r="18" fill="none"
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="text-primary"
                    strokeDasharray={`${Math.min((storageStats.totalBytes / (5 * 1024 * 1024 * 1024)) * 113, 113)} 113`}
                  />
                </svg>
                <HardDrive className="w-4 h-4 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" data-testid="text-total-storage">
                  {formatFileSize(storageStats.totalBytes)}
                </p>
                <p className="text-xs text-muted-foreground">total storage used</p>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar className="w-8 h-8 border border-border">
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

      <main
        className="flex-1 md:ml-64 p-4 lg:p-8 relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
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

        {paymentStatus?.needsPaymentMethod && (
          <Card className="mb-4 border-yellow-500/50 dark:border-yellow-500/30" data-testid="billing-banner">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500/10 shrink-0">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" data-testid="text-billing-title">Payment method needed</p>
                <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-billing-desc">
                  You've used {formatFileSize(paymentStatus.monthlyConsumedBytes)} this month (10 GB free).
                  Add a payment method so we can bill any overages at $0.10/GB.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleAddPaymentMethod}
                disabled={billingLoading}
                data-testid="button-add-payment"
              >
                {billingLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4 mr-2" />
                )}
                Add Card
              </Button>
            </CardContent>
          </Card>
        )}

        {paymentStatus?.exceededFreeTier && paymentStatus?.hasCard && (
          <Card className="mb-4 border-green-500/50 dark:border-green-500/30" data-testid="billing-ok-banner">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" data-testid="text-billing-ok-title">Payment method on file</p>
                <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-billing-ok-desc">
                  You've used {formatFileSize(paymentStatus.monthlyConsumedBytes)} this month. 
                  Overages beyond 10 GB will be billed at $0.10/GB at the end of the billing cycle.
                </p>
              </div>
              <Badge variant="secondary" data-testid="badge-card-on-file">
                <CreditCard className="w-3 h-3 mr-1" />
                Card on file
              </Badge>
            </CardContent>
          </Card>
        )}

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

                <Button variant="outline" size="sm" disabled={uploadManager.isProcessing} asChild data-testid="button-upload">
                  <label className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    Files
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                </Button>

                <Button variant="outline" size="sm" disabled={uploadManager.isProcessing} asChild data-testid="button-upload-folder">
                  <label className="cursor-pointer">
                    <FolderUp className="w-4 h-4 mr-2" />
                    Folder
                    <input
                      ref={folderInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFolderUpload}
                      {...{ webkitdirectory: "", directory: "", multiple: true } as any}
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
                <div className="flex justify-center gap-2 flex-wrap">
                  <Button variant="outline" onClick={() => setIsNewFolderOpen(true)}>
                    <FolderPlus className="w-4 h-4 mr-2" />
                    New Folder
                  </Button>
                  <Button asChild>
                    <label className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Files
                      <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                    </label>
                  </Button>
                  <Button variant="outline" asChild>
                    <label className="cursor-pointer">
                      <FolderUp className="w-4 h-4 mr-2" />
                      Upload Folder
                      <input
                        type="file"
                        className="hidden"
                        onChange={handleFolderUpload}
                        {...{ webkitdirectory: "", directory: "", multiple: true } as any}
                      />
                    </label>
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Or drag and drop files here
                </p>
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
                        {object.isFolder
                          ? (storageStats?.folderSizes[object.key] != null
                              ? formatFileSize(storageStats.folderSizes[object.key])
                              : "-")
                          : formatFileSize(object.size)}
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
                            data-testid={`button-action-${object.id}`}
                          >
                            {isImageFile(object) ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
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

        <Dialog open={!!previewImage} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
          <DialogContent
            className="max-w-[95vw] max-h-[95vh] w-auto p-0 border-none bg-black/90 overflow-hidden"
            data-testid="image-preview-overlay"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{previewImage?.name ?? "Image Preview"}</DialogTitle>
              <DialogDescription>Preview of {previewImage?.name ?? "image"}</DialogDescription>
            </DialogHeader>
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPreviewImage(null)}
                  className="bg-background/80 backdrop-blur-sm"
                  data-testid="button-close-preview"
                >
                  <X className="w-4 h-4" />
                </Button>
                <div className="bg-background/80 backdrop-blur-sm rounded-md px-3 py-1.5">
                  <p className="text-sm font-medium truncate max-w-xs" data-testid="text-preview-name">{previewImage?.name}</p>
                  {previewImage?.size && (
                    <p className="text-xs text-muted-foreground">{formatFileSize(previewImage.size)}</p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleDownloadFromPreview}
                className="bg-background/80 backdrop-blur-sm"
                data-testid="button-preview-download"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
            {previewImage && (
              <div className="flex items-center justify-center p-4 pt-14 min-h-[50vh] relative">
                {currentImageIndex > 0 && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePrevImage}
                    disabled={previewLoading}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm"
                    data-testid="button-prev-image"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                )}
                <img
                  src={previewImage.url}
                  alt={previewImage.name}
                  className="max-w-full max-h-[80vh] object-contain rounded-md"
                  data-testid="image-preview"
                />
                {currentImageIndex < imageObjects.length - 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleNextImage}
                    disabled={previewLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm"
                    data-testid="button-next-image"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                )}
              </div>
            )}
            {imageObjects.length > 1 && previewImage && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-sm rounded-md px-3 py-1">
                <p className="text-xs text-muted-foreground" data-testid="text-image-counter">
                  {currentImageIndex + 1} / {imageObjects.length}
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {previewLoading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="status" aria-label="Loading preview">
            <Loader2 className="w-10 h-10 animate-spin text-white" />
          </div>
        )}

        {isDragging && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary pointer-events-none"
            data-testid="drag-overlay"
          >
            <div className="bg-background rounded-md p-8 text-center shadow-lg">
              <Upload className="w-12 h-12 mx-auto text-primary mb-4" />
              <p className="text-lg font-medium">Drop files or folders here</p>
              <p className="text-sm text-muted-foreground">Files will be uploaded to the current folder</p>
            </div>
          </div>
        )}

        {uploadManager.uploads.length > 0 && (isUploadPanelVisible || uploadManager.isProcessing) && (
          <div
            className="fixed bottom-4 right-4 z-30 w-96 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-md shadow-lg"
            data-testid="upload-panel"
          >
            <div
              className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border cursor-pointer"
              onClick={() => setIsUploadPanelOpen(!isUploadPanelOpen)}
              data-testid="button-toggle-upload-panel"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Upload className="w-4 h-4 shrink-0" />
                <span className="text-sm font-medium truncate">
                  {uploadManager.isProcessing
                    ? `Uploading ${uploadManager.activeCount} file(s)...`
                    : `${uploadManager.completedCount} completed, ${uploadManager.failedCount} failed`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!uploadManager.isProcessing) {
                      uploadManager.clearCompleted();
                    }
                    setIsUploadPanelVisible(false);
                  }}
                  data-testid="button-close-uploads"
                >
                  <X className="w-4 h-4" />
                </Button>
                {isUploadPanelOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {uploadManager.isProcessing && (
              <div className="px-4 py-2 border-b border-border">
                <Progress value={uploadManager.overallProgress} className="h-2" data-testid="progress-overall" />
                <p className="text-xs text-muted-foreground mt-1">{uploadManager.overallProgress}% overall</p>
              </div>
            )}

            {isUploadPanelOpen && (
              <div className="max-h-64 overflow-y-auto">
                {Array.from(uploadManager.folderGroups.folders.entries()).map(([folderName, items]) => {
                  const folderCompleted = items.filter((i) => i.status === "completed").length;
                  const folderFailed = items.filter((i) => i.status === "failed").length;
                  const folderTotal = items.length;
                  const folderProgress = folderTotal > 0
                    ? Math.round(items.reduce((s, i) => s + i.progress, 0) / folderTotal)
                    : 0;
                  const folderCancelled = items.filter((i) => i.status === "cancelled").length;
                  const allDone = folderCompleted + folderFailed + folderCancelled === folderTotal;
                  const currentFile = items.find((i) => i.status === "uploading");
                  const currentFileName = currentFile
                    ? (currentFile.relativePath || currentFile.file.name).split("/").pop()
                    : null;
                  const failedItems = items.filter((i) => i.status === "failed");

                  return (
                    <div
                      key={folderName}
                      className="px-4 py-2 border-b border-border/50 last:border-b-0"
                      data-testid={`upload-folder-${folderName}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Folder className="w-4 h-4 text-blue-500 shrink-0" />
                          <span className="text-sm font-medium truncate">{folderName}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {folderCompleted}/{folderTotal}
                          </span>
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          {allDone && folderFailed === 0 && (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          )}
                          {allDone && folderFailed > 0 && (
                            <XCircle className="w-4 h-4 text-destructive" />
                          )}
                          {!allDone && (
                            <span className="text-xs text-muted-foreground">{folderProgress}%</span>
                          )}
                        </div>
                      </div>
                      {!allDone && (
                        <Progress value={folderProgress} className="h-1.5 mt-1.5" data-testid={`progress-folder-${folderName}`} />
                      )}
                      {currentFileName && (
                        <div className="overflow-hidden mt-1">
                          <p
                            className="text-xs text-muted-foreground whitespace-nowrap animate-marquee"
                            data-testid={`upload-current-file-${folderName}`}
                          >
                            {currentFileName}
                          </p>
                        </div>
                      )}
                      {failedItems.length > 0 && (
                        <div className="mt-1.5 space-y-1" data-testid={`upload-folder-failures-${folderName}`}>
                          <p className="text-xs text-destructive font-medium">{failedItems.length} failed:</p>
                          {failedItems.map((fi) => {
                            const fileName = (fi.relativePath || fi.file.name).split("/").pop();
                            return (
                              <div key={fi.id} className="flex items-center justify-between gap-2 pl-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs truncate" data-testid={`upload-failed-name-${fi.id}`}>{fileName}</p>
                                  <p className="text-xs text-destructive/80 truncate">{fi.error || "Unknown error"}</p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => uploadManager.retryUpload(fi.id, currentPath)}
                                  data-testid={`button-retry-${fi.id}`}
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {uploadManager.folderGroups.standalone.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-2 border-b border-border/50 last:border-b-0"
                    data-testid={`upload-item-${item.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" data-testid={`upload-name-${item.id}`}>
                        {item.file.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{formatFileSize(item.file.size)}</span>
                        {item.status === "uploading" && (
                          <Progress value={item.progress} className="h-1.5 flex-1" data-testid={`progress-${item.id}`} />
                        )}
                        {item.status === "uploading" && (
                          <span className="text-xs text-muted-foreground">{item.progress}%</span>
                        )}
                      </div>
                      {item.error && (
                        <p className="text-xs text-destructive mt-0.5">{item.error}</p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {item.status === "completed" && (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                      {item.status === "failed" && (
                        <div className="flex items-center gap-1">
                          <XCircle className="w-4 h-4 text-destructive" />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => uploadManager.retryUpload(item.id, currentPath)}
                            data-testid={`button-retry-${item.id}`}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      {item.status === "cancelled" && (
                        <Ban className="w-4 h-4 text-muted-foreground" />
                      )}
                      {(item.status === "uploading" || item.status === "queued") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => uploadManager.cancelUpload(item.id)}
                          data-testid={`button-cancel-${item.id}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                      {item.status === "queued" && (
                        <span className="text-xs text-muted-foreground">Queued</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
