import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchWithAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatFileSize } from "@/lib/file-utils";
import { useStorageStats } from "@/hooks/use-s3";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  LogOut,
  HardDrive,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  User,
  Mail,
  Shield,
  ArrowLeft,
  Share2,
  XCircle,
  FileText,
  Menu,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

export default function Profile() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: storageStats } = useStorageStats("");

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

  interface ShareItem {
    id: string;
    objectName: string;
    recipientEmail: string;
    token: string;
    expiresAt: string;
    createdAt: string;
    revokedAt: string | null;
    isExpired: boolean;
    isRevoked: boolean;
  }

  const { data: shares, isLoading: sharesLoading } = useQuery<ShareItem[]>({
    queryKey: ["/api/shares"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/shares");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (shareId: string) => {
      const res = await apiRequest("POST", `/api/shares/${shareId}/revoke`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shares"] });
      toast({ title: "Share revoked", description: "The share link is no longer active." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to revoke", description: error.message, variant: "destructive" });
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
        description: "You can add a payment method anytime from your profile.",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`;
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "";

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col md:flex-row">
      <div className="md:hidden sticky top-0 z-20 bg-card border-b border-border px-4 py-3 flex items-center justify-between" data-testid="mobile-header">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-back-to-storage"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="text-lg font-bold font-display tracking-tight">Profile</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="mobile-nav-storage">
            <HardDrive className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <aside className="w-64 bg-card border-r border-border hidden md:flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="goyoyd" className="w-8 h-8 rounded-lg shadow-lg shadow-primary/25" data-testid="img-logo" />
            <span className="text-lg font-bold font-display tracking-tight" data-testid="text-logo">goyoyd</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            onClick={() => navigate("/")}
            data-testid="nav-storage"
          >
            <HardDrive className="w-4 h-4" />
            Storage Browser
          </Button>
          <Button
            variant="secondary"
            className="w-full justify-start gap-3 bg-secondary/50 font-medium"
            data-testid="nav-profile"
          >
            <User className="w-4 h-4" />
            {user?.firstName || "Profile"}
          </Button>
        </nav>

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
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate" data-testid="text-sidebar-username">{fullName}</p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-sidebar-email">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={() => logout()} data-testid="button-logout">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      <main className="flex-1 md:ml-64 p-3 sm:p-4 lg:p-8">
        <header className="flex flex-col gap-4 mb-4 sm:mb-6 hidden md:flex">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold font-display text-foreground" data-testid="text-profile-title">Profile</h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage your account and billing</p>
            </div>
          </div>
        </header>

        <div className="max-w-2xl space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Account Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16 border-2 border-border">
                  <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xl font-semibold" data-testid="text-profile-name">{fullName}</p>
                  <p className="text-sm text-muted-foreground" data-testid="text-profile-username">@{user?.username}</p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-3">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm" data-testid="text-profile-email">{user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Account ID</p>
                    <p className="text-sm font-mono text-muted-foreground" data-testid="text-profile-id">{user?.id}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Billing & Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3">
                  {paymentStatus?.hasCard ? (
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0">
                      <CreditCard className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium" data-testid="text-payment-status">
                      {paymentStatus?.hasCard ? "Card on file" : "Free member"}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="text-payment-desc">
                      {paymentStatus?.hasCard
                        ? "Your payment method is saved and ready for billing."
                        : "No payment method added. 10 GB/month is free."}
                    </p>
                  </div>
                </div>
                <Button
                  variant={paymentStatus?.hasCard ? "outline" : "default"}
                  onClick={handleAddPaymentMethod}
                  disabled={billingLoading}
                  className="w-full sm:w-auto"
                  data-testid="button-manage-payment"
                >
                  {billingLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4 mr-2" />
                  )}
                  {paymentStatus?.hasCard ? "Update Card" : "Add Payment Method"}
                </Button>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium mb-3">Usage This Month</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-md bg-muted/50">
                    <p className="text-xs text-muted-foreground">Data Uploaded</p>
                    <p className="text-lg font-semibold" data-testid="text-monthly-usage">
                      {formatFileSize(paymentStatus?.monthlyConsumedBytes ?? 0)}
                    </p>
                  </div>
                  <div className="p-3 rounded-md bg-muted/50">
                    <p className="text-xs text-muted-foreground">Free Allowance</p>
                    <p className="text-lg font-semibold" data-testid="text-free-tier">10 GB</p>
                  </div>
                </div>
              </div>

              {paymentStatus?.needsPaymentMethod && (
                <>
                  <Separator />
                  <div className="flex items-center gap-3 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium" data-testid="text-payment-warning">Payment method needed</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        You've exceeded the free 10 GB tier. Add a card to continue uploading.
                        Overages are billed at $0.10/GB.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {paymentStatus?.exceededFreeTier && paymentStatus?.hasCard && (
                <>
                  <Separator />
                  <div className="flex items-center gap-3 p-3 rounded-md bg-green-500/10 border border-green-500/30">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium" data-testid="text-billing-active">Billing active</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Overages beyond 10 GB will be billed at $0.10/GB at the end of the billing cycle.
                      </p>
                    </div>
                    <Badge variant="secondary" data-testid="badge-card-on-file">
                      Card on file
                    </Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Storage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative w-14 h-14 shrink-0">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="23" fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
                    <circle
                      cx="28" cy="28" r="23" fill="none"
                      strokeWidth="3"
                      strokeLinecap="round"
                      className="text-primary"
                      strokeDasharray={`${Math.min(((storageStats?.totalBytes ?? 0) / (5 * 1024 * 1024 * 1024)) * 144.5, 144.5)} 144.5`}
                    />
                  </svg>
                  <HardDrive className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div>
                  <p className="text-xl font-semibold" data-testid="text-profile-storage">
                    {formatFileSize(storageStats?.totalBytes ?? 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">total storage used</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Share2 className="w-5 h-5" />
                Shared by Me
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sharesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : !shares || shares.length === 0 ? (
                <div className="text-center py-6" data-testid="text-no-shares">
                  <Share2 className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No files shared yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Share files from your Storage Browser using the share button
                  </p>
                </div>
              ) : (
                <div className="space-y-3" data-testid="shares-list">
                  {shares.map((share) => {
                    const isActive = !share.isRevoked && !share.isExpired;
                    return (
                      <div
                        key={share.id}
                        className="flex items-start sm:items-center gap-3 p-3 rounded-md border border-border/50"
                        data-testid={`share-item-${share.id}`}
                      >
                        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" data-testid={`text-share-name-${share.id}`}>
                            {share.objectName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            Shared with {share.recipientEmail}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(share.createdAt), "MMM d, yyyy")}
                            {" - "}
                            Expires {format(new Date(share.expiresAt), "MMM d, yyyy")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {share.isRevoked ? (
                            <Badge variant="secondary" data-testid={`badge-share-status-${share.id}`}>
                              Revoked
                            </Badge>
                          ) : share.isExpired ? (
                            <Badge variant="secondary" data-testid={`badge-share-status-${share.id}`}>
                              Expired
                            </Badge>
                          ) : (
                            <>
                              <Badge variant="default" data-testid={`badge-share-status-${share.id}`}>
                                Active
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => revokeMutation.mutate(share.id)}
                                disabled={revokeMutation.isPending}
                                data-testid={`button-revoke-${share.id}`}
                              >
                                <XCircle className="w-4 h-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
