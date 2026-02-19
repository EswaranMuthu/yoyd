import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Download, FileText, AlertTriangle, Clock } from "lucide-react";

export default function ShareDownload() {
  const params = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<{
    objectName: string;
    downloadUrl: string;
    expiresAt: string;
  } | null>(null);

  useEffect(() => {
    async function fetchShare() {
      try {
        const res = await fetch(`/api/shares/download/${params.token}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.message || "This share link is no longer available");
          return;
        }
        const data = await res.json();
        setShareData(data);
      } catch {
        setError("Failed to load shared file");
      } finally {
        setLoading(false);
      }
    }
    fetchShare();
  }, [params.token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="share-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="share-card">
        <CardContent className="pt-6">
          <div className="text-center space-y-6">
            <div className="flex items-center justify-center gap-3 mb-2">
              <img src="/favicon.png" alt="goyoyd" className="w-8 h-8 rounded-lg" />
              <span className="text-lg font-bold font-display tracking-tight">goyoyd</span>
            </div>

            {error ? (
              <div className="space-y-4" data-testid="share-error">
                <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-destructive" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold" data-testid="text-share-error-title">Link Unavailable</h2>
                  <p className="text-muted-foreground mt-2" data-testid="text-share-error-message">{error}</p>
                </div>
              </div>
            ) : shareData ? (
              <div className="space-y-4" data-testid="share-ready">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold" data-testid="text-share-filename">{shareData.objectName}</h2>
                  <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mt-2">
                    <Clock className="w-3 h-3" />
                    <span data-testid="text-share-expires">
                      Expires {new Date(shareData.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    window.open(shareData.downloadUrl, "_blank");
                  }}
                  data-testid="button-download-shared"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Shared via goyoyd - Where Data Belongs to Its Owner.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
